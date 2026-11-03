import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

const INCOMING_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;
const QUIET_PATHS = /^\/api\/v1\/health(\/|$)/;

export interface RequestWithId extends Request {
  requestId?: string;
}

export function requestIdOf(request: unknown): string | null {
  const id = (request as RequestWithId | undefined)?.requestId;
  return typeof id === 'string' ? id : null;
}

export function pathWithoutQuery(url: string): string {
  const index = url.indexOf('?');
  return index === -1 ? url : url.slice(0, index);
}

export function assignRequestId(request: RequestWithId, response: Response, next: NextFunction) {
  const incoming = request.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && INCOMING_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  request.requestId = id;
  response.setHeader(REQUEST_ID_HEADER, id);
  next();
}

export function createAccessLogger(logger = new Logger('HTTP')) {
  return (request: RequestWithId, response: Response, next: NextFunction): void => {
    const started = process.hrtime.bigint();
    const path = pathWithoutQuery(request.originalUrl);
    response.on('finish', () => {
      if (QUIET_PATHS.test(path) && response.statusCode < 500) {
        return;
      }
      const entry = {
        requestId: request.requestId ?? null,
        method: request.method,
        path,
        status: response.statusCode,
        durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
      };
      if (response.statusCode >= 500) {
        logger.error(entry);
      } else if (response.statusCode >= 400) {
        logger.warn(entry);
      } else {
        logger.log(entry);
      }
    });
    next();
  };
}
