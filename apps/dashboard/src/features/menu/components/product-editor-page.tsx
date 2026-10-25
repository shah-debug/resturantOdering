'use client';

import { ArrowLeft, FolderPlus, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ProductDetail } from '@app/contracts';
import { Button, Card, CardContent, CardDescription, CardHeader } from '@app/web/ui';
import {
  EmptyState,
  ErrorState,
  isUnavailableError,
  LoadingState,
  UnavailableState,
} from '@/components/states';
import {
  useDeleteProductMutation,
  useGetProductQuery,
  useListAddOnGroupsQuery,
  useListCategoriesQuery,
} from '../menu-api';
import { ConfirmDialog, menuBase, MenuReadOnlyNotice, useMenuAccess } from './menu-parts';
import { ProductForm } from './product-form';
import { ProductImageCard } from './product-image-card';

function DeleteProductCard({
  organizationId,
  product,
}: {
  organizationId: string;
  product: ProductDetail;
}) {
  const router = useRouter();
  const [deleteProduct, deletion] = useDeleteProductMutation();
  const [open, setOpen] = useState(false);

  async function confirm() {
    const response = await deleteProduct({ organizationId, productId: product.id });
    if (!('error' in response)) {
      setOpen(false);
      router.push(menuBase(organizationId));
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <h2 className="text-base font-semibold tracking-tight">Delete product</h2>
        <CardDescription>
          Removes it from your menu for good. Past orders keep their details.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            deletion.reset();
            setOpen(true);
          }}
        >
          Delete product
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={`Delete ${product.name}?`}
          description="This permanently removes the product, its options and its photo."
          confirmLabel="Delete product"
          pendingLabel="Deleting…"
          pending={deletion.isLoading}
          error={deletion.error}
          onConfirm={() => void confirm()}
        />
      </CardContent>
    </Card>
  );
}

export function ProductEditorPage({
  organizationId,
  productId,
  initialCategoryId,
}: {
  organizationId: string;
  productId?: string | undefined;
  initialCategoryId?: string | undefined;
}) {
  const { role, canManage } = useMenuAccess(organizationId);
  const categories = useListCategoriesQuery(organizationId);
  const groups = useListAddOnGroupsQuery(organizationId);
  const product = useGetProductQuery(
    { organizationId, productId: productId ?? '' },
    { skip: !productId },
  );
  const isNew = !productId;
  const base = menuBase(organizationId);
  const queries = isNew ? [categories, groups] : [categories, groups, product];
  const error = queries.find((query) => query.error)?.error;

  const header = (
    <header className="grid gap-2">
      <Link
        href={base}
        className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to menu
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">
        {isNew ? 'New product' : canManage ? 'Edit product' : 'Product'}
      </h1>
      {product.data ? <p className="text-sm text-muted-foreground">{product.data.name}</p> : null}
    </header>
  );

  if (queries.some((query) => query.isLoading)) {
    return (
      <div className="grid gap-6">
        {header}
        <LoadingState label="Loading product…" rows={4} />
      </div>
    );
  }
  if (isUnavailableError(error)) {
    return <UnavailableState error={error} />;
  }
  if (!categories.data || !groups.data || (!isNew && !product.data)) {
    return (
      <div className="grid gap-6">
        {header}
        <ErrorState
          title="We couldn't load this product"
          error={error}
          onRetry={() => queries.forEach((query) => void query.refetch())}
          retrying={queries.some((query) => query.isFetching)}
        />
      </div>
    );
  }
  if (isNew && !canManage) {
    return (
      <div className="grid gap-6">
        {header}
        <EmptyState
          icon={Lock}
          title="Only owners and managers can add products"
          action={
            <Button asChild variant="outline">
              <Link href={base}>Back to menu</Link>
            </Button>
          }
        />
      </div>
    );
  }
  if (isNew && categories.data.length === 0) {
    return (
      <div className="grid gap-6">
        {header}
        <EmptyState
          icon={FolderPlus}
          title="Create a category first"
          description="Every product belongs to a category, like Starters or Drinks."
          action={
            <Button asChild>
              <Link href={base}>Go to menu</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const current = product.data ?? null;
  return (
    <div className="grid gap-6">
      {header}
      {!canManage ? <MenuReadOnlyNotice role={role} /> : null}
      <div
        className={
          current ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start' : 'grid gap-6'
        }
      >
        <ProductForm
          key={current?.id ?? 'new'}
          organizationId={organizationId}
          product={current}
          categories={categories.data}
          groups={groups.data}
          initialCategoryId={initialCategoryId}
          canManage={canManage}
        />
        {current ? (
          <aside className="grid gap-6 lg:sticky lg:top-20">
            <ProductImageCard
              organizationId={organizationId}
              product={current}
              canManage={canManage}
            />
            {canManage ? (
              <DeleteProductCard organizationId={organizationId} product={current} />
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
