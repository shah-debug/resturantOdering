import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import { buildErrorResponse } from '../errors/build-error-response.js';
import { ErrorReporter } from '../observability/error-reporter.js';
import { pathWithoutQuery, requestIdOf } from '../observability/request-context.js';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly errors: ErrorReporter,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const path = String(httpAdapter.getRequestUrl(request));
    const body = buildErrorResponse(exception, path);

    if (body.statusCode >= 500) {
      this.errors.report(exception, {
        source: 'http',
        requestId: requestIdOf(request),
        method: request.method,
        path: pathWithoutQuery(path),
      });
    }

    httpAdapter.reply(ctx.getResponse(), body, body.statusCode);
  }
}
