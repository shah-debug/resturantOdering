import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { apiErrorResponseSchema } from '@app/contracts';
import { AppException, ValidationFailedException } from './app.exception';
import { buildErrorResponse } from './build-error-response';

const now = new Date('2026-01-01T00:00:00.000Z');

describe('buildErrorResponse', () => {
  it('maps NotFoundException to NOT_FOUND', () => {
    const body = buildErrorResponse(new NotFoundException('Menu item not found'), '/x', now);
    expect(body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Menu item not found',
      path: '/x',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(apiErrorResponseSchema.safeParse(body).success).toBe(true);
  });

  it('maps ForbiddenException to FORBIDDEN', () => {
    expect(buildErrorResponse(new ForbiddenException(), '/x', now).code).toBe('FORBIDDEN');
  });

  it('joins array messages from built-in exceptions', () => {
    const body = buildErrorResponse(new BadRequestException(['a is bad', 'b is bad']), '/x', now);
    expect(body.message).toBe('a is bad; b is bad');
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('preserves code and details from AppException subclasses', () => {
    const details = [{ field: 'name', message: 'name should not be empty' }];
    const body = buildErrorResponse(new ValidationFailedException(details), '/x', now);
    expect(body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED', details });
    expect(apiErrorResponseSchema.safeParse(body).success).toBe(true);
  });

  it('hides messages of 5xx HttpExceptions', () => {
    const body = buildErrorResponse(
      new InternalServerErrorException('db password leaked here'),
      '/x',
      now,
    );
    expect(body).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' });
    expect(body.message).not.toContain('password');
  });

  it('hides messages of 5xx AppExceptions', () => {
    const body = buildErrorResponse(
      new AppException(HttpStatus.SERVICE_UNAVAILABLE, 'INTERNAL_ERROR', 'internal detail'),
      '/x',
      now,
    );
    expect(body.message).not.toContain('internal detail');
  });

  it('treats unknown errors as 500 without leaking their message', () => {
    const body = buildErrorResponse(new Error('secret stack info'), '/x', now);
    expect(body).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' });
    expect(body.message).not.toContain('secret');
  });

  it('maps unmapped 4xx statuses to BAD_REQUEST', () => {
    const body = buildErrorResponse(new HttpException('Gone', HttpStatus.GONE), '/x', now);
    expect(body).toMatchObject({ statusCode: 410, code: 'BAD_REQUEST', message: 'Gone' });
  });

  it('maps 429 to RATE_LIMITED', () => {
    const body = buildErrorResponse(
      new HttpException('Slow down', HttpStatus.TOO_MANY_REQUESTS),
      '/x',
      now,
    );
    expect(body.code).toBe('RATE_LIMITED');
  });
});
