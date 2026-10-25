import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode, FieldError } from '@app/contracts';

export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: FieldError[],
  ) {
    super(message, status);
  }
}

export class ValidationFailedException extends AppException {
  constructor(details: FieldError[]) {
    super(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Request validation failed', details);
  }
}
