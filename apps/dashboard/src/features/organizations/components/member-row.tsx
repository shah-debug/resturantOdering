'use client';

import { useState } from 'react';
import { type Member, type MembershipRole, membershipRoleSchema } from '@app/contracts';
import { getErrorMessage } from '@app/web/api';
import { Button, Select, TableCell, TableRow } from '@app/web/ui';
import { cn } from '@/lib/utils';
import { useRemoveMemberMutation, useUpdateMemberMutation } from '../organizations-api';
import { ROLE_LABELS, STATUS_LABELS } from '../roles';

const statusClasses: Record<Member['status'], string> = {
  ACTIVE: 'bg-success/15 text-foreground',
  INVITED: 'bg-secondary text-secondary-foreground',
  SUSPENDED: 'bg-destructive/10 text-destructive',
};

export interface MemberRowProps {
  organizationId: string;
  member: Member;
  isSelf: boolean;
  showActions: boolean;
  assignableRoles: readonly MembershipRole[];
  onRemoved: () => void;
}

export function MemberRow({
  organizationId,
  member,
  isSelf,
  showActions,
  assignableRoles,
  onRemoved,
}: MemberRowProps) {
  const [updateMember, update] = useUpdateMemberMutation();
  const [removeMember, removal] = useRemoveMemberMutation();
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const manageable = showActions && !isSelf && assignableRoles.includes(member.role);
  const target = { organizationId, membershipId: member.membershipId };
  const pendingStatus = update.isLoading && update.originalArgs?.body.status;
  const actionError = update.error ?? removal.error;

  async function handleRemove() {
    const response = await removeMember(target);
    if (!('error' in response)) {
      onRemoved();
    }
    setConfirmingRemoval(false);
  }

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">
          {member.fullName}
          {isSelf ? <span className="ml-1 text-muted-foreground">(you)</span> : null}
        </div>
        <div className="text-muted-foreground break-all">{member.email}</div>
      </TableCell>
      <TableCell>
        {manageable ? (
          <Select
            aria-label={`Role for ${member.fullName}`}
            className="h-9 min-w-36"
            value={member.role}
            disabled={update.isLoading}
            onChange={(event) => {
              const role = membershipRoleSchema.safeParse(event.target.value);
              if (role.success && role.data !== member.role) {
                void updateMember({ ...target, body: { role: role.data } });
              }
            }}
          >
            {assignableRoles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        ) : (
          ROLE_LABELS[member.role]
        )}
      </TableCell>
      <TableCell>
        <span
          className={cn(
            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
            statusClasses[member.status],
          )}
        >
          {STATUS_LABELS[member.status]}
        </span>
      </TableCell>
      {showActions ? (
        <TableCell>
          {manageable ? (
            <div className="grid gap-2">
              {confirmingRemoval ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">Remove {member.fullName}?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    pending={removal.isLoading}
                    pendingText="Removing…"
                    onClick={() => void handleRemove()}
                  >
                    Confirm removal
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removal.isLoading}
                    onClick={() => setConfirmingRemoval(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {member.status === 'ACTIVE' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      pending={pendingStatus === 'SUSPENDED'}
                      pendingText="Suspending…"
                      disabled={update.isLoading}
                      aria-label={`Suspend ${member.fullName}`}
                      onClick={() =>
                        void updateMember({ ...target, body: { status: 'SUSPENDED' } })
                      }
                    >
                      Suspend
                    </Button>
                  ) : null}
                  {member.status === 'SUSPENDED' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      pending={pendingStatus === 'ACTIVE'}
                      pendingText="Reactivating…"
                      disabled={update.isLoading}
                      aria-label={`Reactivate ${member.fullName}`}
                      onClick={() => void updateMember({ ...target, body: { status: 'ACTIVE' } })}
                    >
                      Reactivate
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    aria-label={`Remove ${member.fullName}`}
                    onClick={() => setConfirmingRemoval(true)}
                  >
                    Remove
                  </Button>
                </div>
              )}
              {actionError ? (
                <p role="alert" className="text-sm text-destructive">
                  {getErrorMessage(actionError)}
                </p>
              ) : null}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
      ) : null}
    </TableRow>
  );
}
