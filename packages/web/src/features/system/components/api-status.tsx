'use client';

import { getErrorMessage } from '../../../api/api-error';
import { cn } from '../../../lib/cn';
import { useGetHealthQuery } from '../system-api';

export function ApiStatus() {
  const { data, error, isLoading, isFetching, refetch } = useGetHealthQuery();

  if (isLoading) {
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Checking API status…
      </p>
    );
  }

  if (error || !data) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-destructive">{getErrorMessage(error)}</span>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className={cn(
            'rounded-md border px-3 py-1.5 font-medium transition-colors',
            'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          {isFetching ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    );
  }

  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm">
      <span aria-hidden="true" className="size-2 rounded-full bg-success" />
      API is online
    </p>
  );
}
