'use client';

import { ArrowLeft, ListPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import type { AddOnGroup } from '@app/contracts';
import { Badge, Button, Card, Skeleton } from '@app/web/ui';
import { EmptyState, ErrorState, isUnavailableError, UnavailableState } from '@/components/states';
import { formatRupees } from '@/features/restaurant/money';
import { useDeleteAddOnGroupMutation, useListAddOnGroupsQuery } from '../menu-api';
import { pluralize, selectionSummary } from '../menu-forms';
import { AddOnGroupForm } from './add-on-group-form';
import { ConfirmDialog, menuBase, MenuReadOnlyNotice, useMenuAccess } from './menu-parts';

function GroupCard({
  group,
  canManage,
  onEdit,
  onDelete,
}: {
  group: AddOnGroup;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const addOns = [...group.addOns].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <li>
      <Card className="grid gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <h2 className="truncate text-base font-semibold">{group.name}</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={group.minSelect > 0 ? 'default' : 'secondary'}>
                {selectionSummary(group)}
              </Badge>
              <span>{pluralize(group.addOns.length, 'option')}</span>
              <span aria-hidden="true">·</span>
              <span>Used by {pluralize(group.productCount, 'product')}</span>
            </div>
          </div>
          {canManage ? (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                aria-label={`Edit ${group.name}`}
                onClick={onEdit}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                aria-label={`Delete ${group.name}`}
                onClick={onDelete}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            </div>
          ) : null}
        </div>
        <ul className="flex flex-wrap gap-2" aria-label={`${group.name} options`}>
          {addOns.map((addOn) => (
            <li
              key={addOn.id}
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              <span className={addOn.isAvailable ? 'text-foreground' : 'line-through'}>
                {addOn.name}
              </span>
              {addOn.priceMinor > 0 ? ` +${formatRupees(addOn.priceMinor)}` : ' Free'}
              {!addOn.isAvailable ? <span className="sr-only"> (unavailable)</span> : null}
            </li>
          ))}
        </ul>
      </Card>
    </li>
  );
}

export function CustomizationsPage({ organizationId }: { organizationId: string }) {
  const { role, canManage } = useMenuAccess(organizationId);
  const groups = useListAddOnGroupsQuery(organizationId);
  const [deleteGroup, deletion] = useDeleteAddOnGroupMutation();
  const [editing, setEditing] = useState<AddOnGroup | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AddOnGroup | null>(null);

  if (isUnavailableError(groups.error)) {
    return <UnavailableState error={groups.error} />;
  }

  async function confirmDelete() {
    if (!deleting) return;
    const response = await deleteGroup({ organizationId, groupId: deleting.id });
    if (!('error' in response)) {
      if (editing !== 'new' && editing?.id === deleting.id) {
        setEditing(null);
      }
      setDeleting(null);
    }
  }

  const list = groups.data ?? [];
  let body: ReactNode;
  if (groups.isLoading) {
    body = (
      <div role="status" aria-live="polite" className="grid gap-3">
        <span className="sr-only">Loading customizations…</span>
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  } else if (!groups.data) {
    body = (
      <ErrorState
        title="We couldn't load your customizations"
        error={groups.error}
        onRetry={() => void groups.refetch()}
        retrying={groups.isFetching}
      />
    );
  } else if (list.length === 0) {
    body =
      editing === 'new' ? null : (
        <EmptyState
          icon={ListPlus}
          title="No customization groups yet"
          description="Groups like “Choose a drink” or “Extra toppings” let customers tailor a product."
          action={
            canManage ? (
              <Button onClick={() => setEditing('new')}>
                <Plus aria-hidden="true" />
                New customization group
              </Button>
            ) : null
          }
        />
      );
  } else {
    body = (
      <ul aria-label="Customization groups" className="grid gap-3">
        {list.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            canManage={canManage}
            onEdit={() => setEditing(group)}
            onDelete={() => {
              deletion.reset();
              setDeleting(group);
            }}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <Link
          href={menuBase(organizationId)}
          className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to menu
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Customizations</h1>
            <p className="text-sm text-muted-foreground">
              Reusable choices and extras you can attach to any product.
            </p>
          </div>
          {canManage && list.length > 0 && editing === null ? (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden="true" />
              New customization group
            </Button>
          ) : null}
        </div>
      </header>
      {!canManage && groups.data ? <MenuReadOnlyNotice role={role} /> : null}
      {canManage && editing !== null ? (
        <AddOnGroupForm
          key={editing === 'new' ? 'new' : editing.id}
          organizationId={organizationId}
          group={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : null}
      {body}
      {canManage ? (
        <ConfirmDialog
          open={deleting !== null}
          onOpenChange={(open) => (open ? undefined : setDeleting(null))}
          title={`Delete ${deleting?.name ?? 'group'}?`}
          description={
            deleting && deleting.productCount > 0
              ? `It will be removed from ${pluralize(deleting.productCount, 'product')}.`
              : 'This permanently removes the group and its options.'
          }
          confirmLabel="Delete group"
          pendingLabel="Deleting…"
          pending={deletion.isLoading}
          error={deletion.error}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  );
}
