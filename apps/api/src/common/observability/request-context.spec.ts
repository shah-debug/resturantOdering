import type { NextFunction, Response } from 'express';
import { EventEmitter } from 'node:events';
import type { Logger } from '@nestjs/common';
import {
  assignRequestId,
  createAccessLogger,
  pathWithoutQuery,
  REQUEST_ID_HEADER,
  type RequestWithId,
} from './request-context';

function fakeResponse(statusCode = 200) {
  const emitter = new EventEmitter();
  const headers = new Map<string, string>();
  const response = Object.assign(emitter, {
    statusCode,
    setHeader: (name: string, value: string) => headers.set(name, value),
  }) as unknown as Response & EventEmitter;
  return { response, headers };
}

const noop: NextFunction = () => undefined;

function fakeRequest(overrides: Partial<RequestWithId> = {}): RequestWithId {
  return { headers: {}, method: 'GET', originalUrl: '/', ...overrides } as RequestWithId;
}

describe('request context', () => {
  it('keeps a well-formed incoming request id and echoes it back', () => {
    const request = fakeRequest({ headers: { [REQUEST_ID_HEADER]: 'lb-1234abcd' } });
    const { response, headers } = fakeResponse();
    let calls = 0;
    assignRequestId(request, response, () => {
      calls += 1;
    });
    expect(request.requestId).toBe('lb-1234abcd');
    expect(headers.get(REQUEST_ID_HEADER)).toBe('lb-1234abcd');
    expect(calls).toBe(1);
  });

  it('replaces a malformed or injected request id with a fresh one', () => {
    for (const incoming of [
      'short',
      'has spaces in it',
      'evil\r\nSet-Cookie: x=1',
      'x'.repeat(200),
    ]) {
      const request = fakeRequest({ headers: { [REQUEST_ID_HEADER]: incoming } });
      const { response } = fakeResponse();
      assignRequestId(request, response, noop);
      expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('never logs query strings, which can carry tokens', () => {
    expect(pathWithoutQuery('/api/v1/auth/reset?token=secret')).toBe('/api/v1/auth/reset');
    const entries: unknown[] = [];
    const logger = {
      log: (entry: unknown) => entries.push(entry),
      warn: (entry: unknown) => entries.push(entry),
      error: (entry: unknown) => entries.push(entry),
    } as unknown as Logger;
    const request = fakeRequest({
      method: 'POST',
      originalUrl: '/api/v1/storefront/restaurants/x/orders?token=abc',
      requestId: 'req-12345678',
    });
    const { response } = fakeResponse(201);
    createAccessLogger(logger)(request, response, noop);
    response.emit('finish');
    expect(entries).toEqual([
      expect.objectContaining({
        requestId: 'req-12345678',
        method: 'POST',
        path: '/api/v1/storefront/restaurants/x/orders',
        status: 201,
      }),
    ]);
    expect(JSON.stringify(entries)).not.toContain('abc');
  });

  it('keeps health probes out of the log unless they fail', () => {
    const entries: unknown[] = [];
    const logger = {
      log: (entry: unknown) => entries.push(entry),
      error: (entry: unknown) => entries.push(entry),
    } as unknown as Logger;
    for (const status of [200, 503]) {
      const { response } = fakeResponse(status);
      createAccessLogger(logger)(
        fakeRequest({ originalUrl: '/api/v1/health/ready' }),
        response,
        noop,
      );
      response.emit('finish');
    }
    expect(entries).toHaveLength(1);
  });
});
