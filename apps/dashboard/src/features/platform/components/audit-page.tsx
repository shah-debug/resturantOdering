'use client';

import { Button, Field, Input, Skeleton } from '@app/web/ui';
import { useState } from 'react';
import { ErrorState } from '@/components/states';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useListAuditLogsQuery } from '../platform-api';
import { AuditList } from './audit-list';

export function AuditPage({ organizationId }: { organizationId?: string | undefined }) {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(action.trim().toLowerCase(), 300);
  const validAction = /^[a-z_.]{0,80}$/.test(debounced);
  const logs = useListAuditLogsQuery(
    { organizationId, action: debounced || undefined, page },
    { skip: !validAction },
  );
  const totalPages = logs.data ? Math.max(1, Math.ceil(logs.data.total / logs.data.pageSize)) : 1;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          {organizationId ? 'Activity for one restaurant.' : 'Activity across the platform.'} Newest
          first.
        </p>
      </div>
      <Field
        label="Action starts with"
        hint="For example platform. or order.status"
        error={validAction ? undefined : 'Use lowercase letters, dots and underscores'}
      >
        {(control) => (
          <Input
            {...control}
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
          />
        )}
      </Field>
      {logs.isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : logs.error && !logs.data ? (
        <ErrorState
          error={logs.error}
          onRetry={() => void logs.refetch()}
          retrying={logs.isFetching}
        />
      ) : logs.data ? (
        <AuditList entries={logs.data.items} showOrganization={!organizationId} />
      ) : null}
      {logs.data && logs.data.total > logs.data.pageSize ? (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
