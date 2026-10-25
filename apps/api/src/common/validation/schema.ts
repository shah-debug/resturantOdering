import type { z } from 'zod';
import { ValidationFailedException } from '../errors/app.exception.js';

export function assertValid<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  throw new ValidationFailedException(
    result.error.issues.map((issue) => ({
      field: issue.path.map(String).join('.') || 'body',
      message: issue.message,
    })),
  );
}
