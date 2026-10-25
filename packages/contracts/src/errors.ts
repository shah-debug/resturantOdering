import { z } from 'zod';

export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INVALID_CREDENTIALS',
  'EMAIL_NOT_VERIFIED',
  'ACCOUNT_LOCKED',
  'INVALID_TOKEN',
  'CSRF_REJECTED',
  'INTERNAL_ERROR',
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const fieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
});

export type FieldError = z.infer<typeof fieldErrorSchema>;

export const apiErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  code: errorCodeSchema,
  message: z.string(),
  details: z.array(fieldErrorSchema).optional(),
  path: z.string(),
  timestamp: z.iso.datetime(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
