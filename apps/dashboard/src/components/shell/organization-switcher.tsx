'use client';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import Link from 'next/link';
import type { MembershipSummary } from '@app/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@app/web/ui';
import { ROLE_LABELS } from '@/features/organizations/roles';

export function OrganizationSwitcher({
  memberships,
  currentOrganizationId,
}: {
  memberships: readonly MembershipSummary[];
  currentOrganizationId: string;
}) {
  if (memberships.length < 2) {
    return null;
  }
  const current = memberships.find(
    (membership) => membership.organizationId === currentOrganizationId,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Switch restaurant"
          className="h-9 max-w-44 min-w-0 justify-between gap-2 sm:max-w-60"
        >
          <span className="truncate">{current?.organizationName ?? 'Restaurants'}</span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Your restaurants
        </DropdownMenuLabel>
        {memberships.map((membership) => {
          const selected = membership.organizationId === currentOrganizationId;
          return (
            <DropdownMenuItem key={membership.membershipId} asChild>
              <Link
                href={`/organizations/${encodeURIComponent(membership.organizationId)}`}
                aria-current={selected ? 'page' : undefined}
              >
                <span className="grid min-w-0 flex-1">
                  <span className="truncate">{membership.organizationName}</span>
                  <span className="text-xs text-muted-foreground">
                    {ROLE_LABELS[membership.role]}
                  </span>
                </span>
                {selected ? <Check aria-hidden="true" /> : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus aria-hidden="true" />
            Add a restaurant
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
