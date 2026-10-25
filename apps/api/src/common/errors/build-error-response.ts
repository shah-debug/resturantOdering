import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorResponse, ErrorCode } from '@app/contracts';
import { AppException } from './app.exception.js';

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
};

const INTERNAL_MESSAGE = 'An unexpected error occurred';

function codeForStatus(status: number): ErrorCode {
  if (status >= 500) {
    return 'INTERNAL_ERROR';
  }
  return STATUS_TO_CODE[status] ?? 'BAD_REQUEST';
}

function extractMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (typeof response === 'object' && 'message' in response) {
    const { message } = response;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
      return message.join('; ');
    }
  }
  return exception.message;
}

export function buildErrorResponse(
  exception: unknown,
  path: string,
  now: Date = new Date(),
): ApiErrorResponse {
  const base = { path, timestamp: now.toISOString() };

  if (exception instanceof AppException) {
    const statusCode = exception.getStatus();
    return {
      ...base,
      statusCode,
      code: exception.code,
      message: statusCode >= 500 ? INTERNAL_MESSAGE : exception.message,
      ...(exception.details ? { details: exception.details } : {}),
    };
  }

  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    return {
      ...base,
      statusCode,
      code: codeForStatus(statusCode),
      message: statusCode >= 500 ? INTERNAL_MESSAGE : extractMessage(exception),
    };
  }

  return {
    ...base,
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: INTERNAL_MESSAGE,
  };
}
