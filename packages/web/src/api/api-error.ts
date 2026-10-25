import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { apiErrorResponseSchema, type ApiErrorResponse } from '@app/contracts';

export const NETWORK_ERROR_MESSAGE =
  'Unable to reach the server. Check your connection and try again.';
export const UNKNOWN_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export function toApiError(
  error: FetchBaseQueryError | SerializedError | undefined,
): ApiErrorResponse | null {
  if (!error || !('status' in error)) {
    return null;
  }
  const parsed = apiErrorResponseSchema.safeParse(error.data);
  return parsed.success ? parsed.data : null;
}

export function getFieldErrors(
  error: FetchBaseQueryError | SerializedError | undefined,
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const detail of toApiError(error)?.details ?? []) {
    const field = detail.field.split('.').at(-1) ?? detail.field;
    fieldErrors[field] ??= detail.message;
  }
  return fieldErrors;
}

export function getErrorMessage(error: FetchBaseQueryError | SerializedError | undefined): string {
  const apiError = toApiError(error);
  if (apiError) {
    return apiError.message;
  }
  if (error && 'status' in error && error.status === 'FETCH_ERROR') {
    return NETWORK_ERROR_MESSAGE;
  }
  return UNKNOWN_ERROR_MESSAGE;
}
