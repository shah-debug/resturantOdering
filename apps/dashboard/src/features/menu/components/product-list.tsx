'use client';

import { PackagePlus, Pencil, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import type { Paginated, ProductStatus, ProductSummary } from '@app/contracts';
import { getErrorMessage } from '@app/web/api';
import { Button, Card, Skeleton, Switch } from '@app/web/ui';
import { EmptyState, ErrorState } from '@/components/states';
import { formatRupees } from '@/features/restaurant/money';
import { cn } from '@/lib/utils';
import { usePatchProductMutation } from '../menu-api';
import { menuBase, ProductStatusBadge, ProductThumbnail } from './menu-parts';

function priceLabel(product: ProductSummary): string {
  if (product.priceFromMinor === null) {
    return 'No options yet';
  }
  const price = formatRupees(product.priceFromMinor);
  return product.variantCount > 1 ? `From ${price}` : price;
}

function ProductRow({
  organizationId,
  product,
  canManage,
  showCategory,
}: {
  organizationId: string;
  product: ProductSummary;
  canManage: boolean;
  showCategory: boolean;
}) {
  const [patchProduct, patch] = usePatchProductMutation();
  const switchId = useId();
  const href = `${menuBase(organizationId)}/products/${encodeURIComponent(product.id)}`;
  const pendingBody = patch.isLoading ? patch.originalArgs?.body : undefined;
  const available = pendingBody?.isAvailable ?? product.isAvailable;
  const publishing = pendingBody?.status !== undefined;
  const nextStatus: ProductStatus = product.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
  const target = { organizationId, productId: product.id };

  return (
    <li className="grid gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
        <ProductThumbnail imageUrl={product.imageUrl} />
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link
              href={href}
              className="truncate rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {product.name}
            </Link>
            <ProductStatusBadge status={product.status} />
            {!product.isAvailable && !canManage ? (
              <span className="text-xs text-muted-foreground">Unavailable</span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{priceLabel(product)}</span>
            {showCategory ? <span> · {product.categoryName}</span> : null}
          </p>
        </div>
        {canManage ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
            <div className="flex items-center gap-2">
              <Switch
                id={switchId}
                aria-label={`Available to order: ${product.name}`}
                checked={available}
                disabled={patch.isLoading}
                onCheckedChange={(isAvailable) =>
                  void patchProduct({ ...target, body: { isAvailable } })
                }
              />
              <label
                htmlFor={switchId}
                className="text-sm text-muted-foreground"
                aria-hidden="true"
              >
                Available
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-label={`${nextStatus === 'PUBLISHED' ? 'Publish' : 'Unpublish'} ${product.name}`}
                pending={publishing}
                pendingText={nextStatus === 'PUBLISHED' ? 'Publishing…' : 'Unpublishing…'}
                disabled={patch.isLoading}
                onClick={() => void patchProduct({ ...target, body: { status: nextStatus } })}
              >
                {nextStatus === 'PUBLISHED' ? 'Publish' : 'Unpublish'}
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={href} aria-label={`Edit ${product.name}`}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {patch.error ? (
        <p role="alert" className="text-sm text-destructive">
          {getErrorMessage(patch.error)}
        </p>
      ) : null}
    </li>
  );
}

export function ProductListSkeleton() {
  return (
    <Card role="status" aria-live="polite" className="divide-y">
      <span className="sr-only">Loading products…</span>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 p-3 sm:p-4">
          <Skeleton className="size-14 rounded-lg" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-8 w-24 sm:block" />
        </div>
      ))}
    </Card>
  );
}

export function ProductList({
  organizationId,
  result,
  canManage,
  showCategory,
  filtered,
  newProductHref,
  onClearFilters,
  onRetry,
  onPageChange,
}: {
  organizationId: string;
  result: {
    data?: Paginated<ProductSummary> | undefined;
    error?: Parameters<typeof getErrorMessage>[0];
    isLoading: boolean;
    isFetching: boolean;
  };
  canManage: boolean;
  showCategory: boolean;
  filtered: boolean;
  newProductHref: string;
  onClearFilters: () => void;
  onRetry: () => void;
  onPageChange: (page: number) => void;
}) {
  const { data, error, isLoading, isFetching } = result;
  if (isLoading) {
    return <ProductListSkeleton />;
  }
  if (!data) {
    return (
      <ErrorState
        title="We couldn't load your products"
        error={error}
        onRetry={onRetry}
        retrying={isFetching}
      />
    );
  }
  if (data.items.length === 0) {
    return filtered ? (
      <EmptyState
        icon={SearchX}
        title="No products match"
        description="Try a different search or status."
        action={
          <Button variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={PackagePlus}
        title="No products yet"
        description={
          canManage
            ? 'Add your first product with its options and prices.'
            : 'Products will appear here once an owner or manager adds them.'
        }
        action={
          canManage ? (
            <Button asChild>
              <Link href={newProductHref}>New product</Link>
            </Button>
          ) : null
        }
      />
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <Card className={cn('overflow-hidden', isFetching && 'opacity-80')}>
      <ul aria-label="Products" aria-busy={isFetching || undefined} className="divide-y">
        {data.items.map((product) => (
          <ProductRow
            key={product.id}
            organizationId={organizationId}
            product={product}
            canManage={canManage}
            showCategory={showCategory}
          />
        ))}
      </ul>
      <nav
        aria-label="Pagination"
        className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm"
      >
        <span className="text-muted-foreground">
          Page {data.page} of {totalPages} · {data.total}{' '}
          {data.total === 1 ? 'product' : 'products'}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.page <= 1 || isFetching}
            onClick={() => onPageChange(data.page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page >= totalPages || isFetching}
            onClick={() => onPageChange(data.page + 1)}
          >
            Next
          </Button>
        </div>
      </nav>
    </Card>
  );
}
