import type { z } from 'zod';

export type FieldErrors = Record<string, string>;

export type ValidationResult<T> =
  { success: true; data: T } | { success: false; errors: FieldErrors };

export function validateForm<TSchema extends z.ZodType>(
  schema: TSchema,
  values: unknown,
  messages: FieldErrors = {},
): ValidationResult<z.output<TSchema>> {
  const result = schema.safeParse(values);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= messages[field] ?? issue.message;
  }
  return { success: false, errors };
}

export function formValues(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  new FormData(form).forEach((value, key) => {
    if (typeof value === 'string') {
      values[key] = value;
    }
  });
  return values;
}

export function safeNextPath(next: string | undefined): string {
  if (
    !next ||
    !next.startsWith('/') ||
    next.startsWith('//') ||
    [...next].some((char) => char <= ' ' || char === '\u007F' || char === '\\' || /\s/.test(char))
  ) {
    return '/';
  }
  return next;
}
