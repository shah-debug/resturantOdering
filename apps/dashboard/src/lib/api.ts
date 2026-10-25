import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { SerializedError } from '@reduxjs/toolkit';
import { baseApi } from '@app/web/api';

export const dashboardApi = baseApi.enhanceEndpoints({
  addTagTypes: ['Me', 'Organization', 'Member', 'Onboarding', 'Branch', 'SlugAvailability'],
});

export function hasHttpStatus(
  error: FetchBaseQueryError | SerializedError | undefined,
  ...statuses: number[]
): boolean {
  return Boolean(
    error &&
    'status' in error &&
    typeof error.status === 'number' &&
    statuses.includes(error.status),
  );
}
