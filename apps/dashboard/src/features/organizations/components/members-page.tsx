'use client';

import { Users } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Table, TableBody, TableHead, TableHeader, TableRow } from '@app/web/ui';
import { useMeQuery } from '@/features/auth/auth-api';
import {
  EmptyState,
  ErrorState,
  isUnavailableError,
  LoadingState,
  UnavailableState,
} from '@/components/states';
import { useListMembersQuery } from '../organizations-api';
import { assignableRoles, ROLE_LABELS } from '../roles';
import { InviteMemberForm } from './invite-member-form';
import { MemberRow } from './member-row';

export const MEMBERS_PAGE_SIZE = 20;

export function MembersPage({ organizationId }: { organizationId: string }) {
  const [page, setPage] = useState(1);
  const { data: me } = useMeQuery();
  const { data, error, isLoading, isFetching, refetch } = useListMembersQuery({
    organizationId,
    page,
    pageSize: MEMBERS_PAGE_SIZE,
  });

  const membership = me?.memberships.find((entry) => entry.organizationId === organizationId);
  const roles = assignableRoles(membership?.role);
  const canManage = roles.length > 0;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  if (isUnavailableError(error)) {
    return <UnavailableState error={error} />;
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Team members</h1>
        {membership ? (
          <p className="text-sm text-muted-foreground">Your role: {ROLE_LABELS[membership.role]}</p>
        ) : null}
      </header>

      {isLoading ? (
        <LoadingState label="Loading team members…" />
      ) : error || !data ? (
        <ErrorState
          title="We couldn't load your team"
          error={error}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No team members yet"
          description={
            canManage
              ? 'Invite your first team member using the form below.'
              : 'Team members will appear here once they are invited.'
          }
        />
      ) : (
        <Card>
          <Table aria-label="Team members" aria-busy={isFetching || undefined}>
            <TableHeader className="max-sm:sr-only">
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead>Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((member) => (
                <MemberRow
                  key={member.membershipId}
                  organizationId={organizationId}
                  member={member}
                  isSelf={member.userId === me?.user.id}
                  showActions={canManage}
                  assignableRoles={roles}
                  onRemoved={() => {
                    if (data.items.length === 1 && page > 1) {
                      setPage(page - 1);
                    }
                  }}
                />
              ))}
            </TableBody>
          </Table>
          <nav
            aria-label="Pagination"
            className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm"
          >
            <span className="text-muted-foreground">
              Page {data.page} of {totalPages} · {data.total}{' '}
              {data.total === 1 ? 'member' : 'members'}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </nav>
        </Card>
      )}

      {canManage ? <InviteMemberForm organizationId={organizationId} roles={roles} /> : null}
    </div>
  );
}
