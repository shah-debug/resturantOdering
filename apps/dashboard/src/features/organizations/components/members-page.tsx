'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getErrorMessage } from '@app/web/api';
import {
  Alert,
  Button,
  buttonVariants,
  Card,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@app/web/ui';
import { useMeQuery } from '@/features/auth/auth-api';
import { hasHttpStatus } from '@/lib/api';
import { useGetOrganizationQuery, useListMembersQuery } from '../organizations-api';
import { assignableRoles, ROLE_LABELS } from '../roles';
import { InviteMemberForm } from './invite-member-form';
import { MemberRow } from './member-row';

export const MEMBERS_PAGE_SIZE = 20;

export function MembersPage({ organizationId }: { organizationId: string }) {
  const [page, setPage] = useState(1);
  const { data: me } = useMeQuery();
  const { data: organization } = useGetOrganizationQuery(organizationId);
  const { data, error, isLoading, isFetching, refetch } = useListMembersQuery({
    organizationId,
    page,
    pageSize: MEMBERS_PAGE_SIZE,
  });

  const membership = me?.memberships.find((entry) => entry.organizationId === organizationId);
  const roles = assignableRoles(membership?.role);
  const canManage = roles.length > 0;
  const title = organization?.name ?? membership?.organizationName ?? 'Organization';
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  if (hasHttpStatus(error, 403, 404)) {
    return (
      <div className="grid max-w-lg gap-4">
        <Alert variant="destructive" title="Organization unavailable">
          <p>{getErrorMessage(error)}</p>
          <p>It may not exist, or you may not have access to its team.</p>
        </Alert>
        <Link
          href="/"
          className={buttonVariants({ variant: 'outline', className: 'justify-self-start' })}
        >
          Back to your organizations
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="text-sm text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:underline">
            Organizations
          </Link>{' '}
          / {title}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Team members</h1>
        {membership ? (
          <p className="text-sm text-muted-foreground">Your role: {ROLE_LABELS[membership.role]}</p>
        ) : null}
      </header>

      <Card>
        {isLoading ? (
          <p role="status" aria-live="polite" className="p-6 text-sm text-muted-foreground">
            Loading team members…
          </p>
        ) : error || !data ? (
          <div className="p-4 sm:p-6">
            <Alert variant="destructive">
              <div className="flex flex-wrap items-center gap-3">
                <span>{getErrorMessage(error)}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refetch()}
                  pending={isFetching}
                  pendingText="Retrying…"
                >
                  Retry
                </Button>
              </div>
            </Alert>
          </div>
        ) : data.items.length === 0 ? (
          <div className="grid gap-1 p-6 text-center">
            <p className="font-medium">No team members yet</p>
            <p className="text-sm text-muted-foreground">
              {canManage
                ? 'Invite your first team member using the form below.'
                : 'Team members will appear here once they are invited.'}
            </p>
          </div>
        ) : (
          <>
            <Table aria-label="Team members" aria-busy={isFetching || undefined}>
              <TableHeader>
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
          </>
        )}
      </Card>

      {canManage ? <InviteMemberForm organizationId={organizationId} roles={roles} /> : null}
    </div>
  );
}
