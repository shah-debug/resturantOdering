import { jsonResponse } from '@app/web/testing';
import { vi } from 'vitest';

export interface ApiCall {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
}

export type ApiHandler = (call: ApiCall) => Response | undefined;

export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  details?: { field: string; message: string }[],
): Response {
  return jsonResponse(
    {
      statusCode,
      code,
      message,
      ...(details ? { details } : {}),
      path: '/api/v1/test',
      timestamp: '2026-10-30T10:00:00.000Z',
    },
    statusCode,
  );
}

export function mockApi(handler: ApiHandler) {
  const calls: ApiCall[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const text = await request.text();
    const call: ApiCall = {
      method: request.method,
      path: new URL(request.url).pathname.replace(/^\/api\/v1/, ''),
      headers: request.headers,
      body: text ? (JSON.parse(text) as unknown) : undefined,
    };
    calls.push(call);
    return (
      handler(call) ?? errorResponse(404, 'NOT_FOUND', `No mock for ${call.method} ${call.path}`)
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}
