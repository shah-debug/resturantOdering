'use client';

import { ArrowDown, ArrowUp, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Category } from '@app/contracts';
import { getErrorMessage } from '@app/web/api';
import { Badge, Button, Card } from '@app/web/ui';
import { cn } from '@/lib/utils';
import { useDeleteCategoryMutation, useReorderCategoriesMutation } from '../menu-api';
import { pluralize } from '../menu-forms';
import { CategoryFormDialog } from './category-form-dialog';
import { ConfirmDialog } from './menu-parts';

function SelectButton({
  selected,
  onClick,
  label,
  count,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex min-h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
      )}
    >
      <span className="truncate">{label}</span>
      <Badge variant="secondary" className="tabular-nums">
        <span aria-hidden="true">{count}</span>
        <span className="sr-only">{pluralize(count, 'product')}</span>
      </Badge>
    </button>
  );
}

export function CategoryPanel({
  organizationId,
  categories,
  selectedId,
  onSelect,
  canManage,
  onCreate,
}: {
  organizationId: string;
  categories: readonly Category[];
  selectedId: string | null;
  onSelect: (categoryId: string | null) => void;
  canManage: boolean;
  onCreate: () => void;
}) {
  const [reorder, reordering] = useReorderCategoriesMutation();
  const [deleteCategory, deletion] = useDeleteCategoryMutation();
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const total = categories.reduce((sum, category) => sum + category.productCount, 0);

  function move(index: number, offset: -1 | 1) {
    const ids = categories.map((category) => category.id);
    const target = index + offset;
    const current = ids[index];
    const swap = ids[target];
    if (current === undefined || swap === undefined) {
      return;
    }
    ids[index] = swap;
    ids[target] = current;
    void reorder({ organizationId, ids });
  }

  async function confirmDelete() {
    if (!deleting) {
      return;
    }
    const response = await deleteCategory({ organizationId, categoryId: deleting.id });
    if (!('error' in response)) {
      if (selectedId === deleting.id) {
        onSelect(null);
      }
      setDeleting(null);
    }
  }

  return (
    <Card className="grid content-start gap-3 p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold">Categories</h2>
        {canManage ? (
          <Button size="sm" variant="outline" onClick={onCreate}>
            <Plus aria-hidden="true" />
            New category
          </Button>
        ) : null}
      </div>
      {reordering.error ? (
        <p role="alert" className="px-1 text-sm text-destructive">
          {getErrorMessage(reordering.error)}
        </p>
      ) : null}
      <ul className="grid gap-1" aria-label="Categories">
        <li>
          <SelectButton
            selected={selectedId === null}
            onClick={() => onSelect(null)}
            label="All products"
            count={total}
          />
        </li>
        {categories.map((category, index) => (
          <li
            key={category.id}
            className={cn(
              'grid gap-1 rounded-md',
              canManage && 'border border-transparent hover:border-border',
            )}
          >
            <SelectButton
              selected={selectedId === category.id}
              onClick={() => onSelect(category.id)}
              label={category.name}
              count={category.productCount}
            />
            {!category.isActive || canManage ? (
              <div className="flex flex-wrap items-center justify-between gap-1 px-2 pb-1">
                {!category.isActive ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <EyeOff className="size-3" aria-hidden="true" />
                    Hidden from customers
                  </span>
                ) : (
                  <span aria-hidden="true" />
                )}
                {canManage ? (
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Move ${category.name} up`}
                      disabled={index === 0 || reordering.isLoading}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Move ${category.name} down`}
                      disabled={index === categories.length - 1 || reordering.isLoading}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Edit ${category.name}`}
                      onClick={() => setEditing(category)}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      aria-label={`Delete ${category.name}`}
                      onClick={() => {
                        deletion.reset();
                        setDeleting(category);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <>
          <CategoryFormDialog
            organizationId={organizationId}
            open={editing !== null}
            category={editing}
            onOpenChange={(open) => (open ? undefined : setEditing(null))}
          />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => (open ? undefined : setDeleting(null))}
            title={`Delete ${deleting?.name ?? 'category'}?`}
            description={
              deleting && deleting.productCount > 0
                ? `This category still has ${pluralize(deleting.productCount, 'product')}. Move or delete them first.`
                : 'This permanently removes the category from your menu.'
            }
            confirmLabel="Delete category"
            pendingLabel="Deleting…"
            pending={deletion.isLoading}
            error={deletion.error}
            onConfirm={() => void confirmDelete()}
          />
        </>
      ) : null}
    </Card>
  );
}
