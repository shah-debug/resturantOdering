'use client';

import { FolderPlus, Plus, Search, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { productStatusSchema, type ProductStatus } from '@app/contracts';
import { Button, Field, Input, Select, Skeleton } from '@app/web/ui';
import { EmptyState, ErrorState, isUnavailableError, UnavailableState } from '@/components/states';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useListCategoriesQuery, useListProductsQuery } from '../menu-api';
import { CategoryFormDialog } from './category-form-dialog';
import { CategoryPanel } from './category-panel';
import { menuBase, MenuReadOnlyNotice, useMenuAccess } from './menu-parts';
import { ProductList, ProductListSkeleton } from './product-list';

export const PRODUCTS_PAGE_SIZE = 20;
export const SEARCH_DEBOUNCE_MS = 300;

function MenuSkeleton() {
  return (
    <div role="status" aria-live="polite" className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <span className="sr-only">Loading menu…</span>
      <div className="grid content-start gap-2 rounded-xl border bg-card p-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
      <ProductListSkeleton />
    </div>
  );
}

export function MenuPage({ organizationId }: { organizationId: string }) {
  const { role, canManage } = useMenuAccess(organizationId);
  const categories = useListCategoriesQuery(organizationId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProductStatus | ''>('');
  const [page, setPage] = useState(1);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const categoryList = categories.data ?? [];
  const selected = categoryList.find((category) => category.id === selectedId) ?? null;
  const hasCategories = categoryList.length > 0;
  const products = useListProductsQuery(
    {
      organizationId,
      search: debouncedSearch || undefined,
      categoryId: selected?.id,
      status: status || undefined,
      page,
      pageSize: PRODUCTS_PAGE_SIZE,
    },
    { skip: !hasCategories },
  );

  const base = menuBase(organizationId);
  const newProductHref = selected
    ? `${base}/products/new?categoryId=${encodeURIComponent(selected.id)}`
    : `${base}/products/new`;

  if (isUnavailableError(categories.error)) {
    return <UnavailableState error={categories.error} />;
  }

  let body: ReactNode;
  if (categories.isLoading) {
    body = <MenuSkeleton />;
  } else if (!categories.data) {
    body = (
      <ErrorState
        title="We couldn't load your menu"
        error={categories.error}
        onRetry={() => void categories.refetch()}
        retrying={categories.isFetching}
      />
    );
  } else if (!hasCategories) {
    body = (
      <EmptyState
        icon={FolderPlus}
        title={canManage ? 'Create your first category' : 'No menu yet'}
        description={
          canManage
            ? 'Categories like Starters, Mains and Drinks organise your menu. Add one, then add products to it.'
            : 'The menu will appear here once an owner or manager sets it up.'
        }
        action={
          canManage ? (
            <Button onClick={() => setCreatingCategory(true)}>
              <Plus aria-hidden="true" />
              New category
            </Button>
          ) : null
        }
      />
    );
  } else {
    body = (
      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
        <CategoryPanel
          organizationId={organizationId}
          categories={categoryList}
          selectedId={selected?.id ?? null}
          onSelect={(categoryId) => {
            setSelectedId(categoryId);
            setPage(1);
          }}
          canManage={canManage}
          onCreate={() => setCreatingCategory(true)}
        />
        <section aria-labelledby="products-heading" className="grid min-w-0 content-start gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="products-heading" className="text-lg font-semibold tracking-tight">
              {selected ? selected.name : 'All products'}
            </h2>
            {selected?.description ? (
              <p className="text-sm text-muted-foreground">{selected.description}</p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <Field label="Search products" className="gap-1.5">
              {(control) => (
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    {...control}
                    type="search"
                    placeholder="Search by name"
                    className="pl-9"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              )}
            </Field>
            <Field label="Status" className="gap-1.5">
              {(control) => (
                <Select
                  {...control}
                  value={status}
                  onChange={(event) => {
                    const parsed = productStatusSchema.safeParse(event.target.value);
                    setStatus(parsed.success ? parsed.data : '');
                    setPage(1);
                  }}
                >
                  <option value="">All</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                </Select>
              )}
            </Field>
          </div>
          <ProductList
            organizationId={organizationId}
            result={products}
            canManage={canManage}
            showCategory={!selected}
            filtered={Boolean(debouncedSearch || status)}
            newProductHref={newProductHref}
            onClearFilters={() => {
              setSearch('');
              setStatus('');
              setPage(1);
            }}
            onRetry={() => void products.refetch()}
            onPageChange={setPage}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
          <p className="text-sm text-muted-foreground">
            Organise categories and products, set prices and control what customers can order.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`${base}/customizations`}>
              <SlidersHorizontal aria-hidden="true" />
              Customizations
            </Link>
          </Button>
          {canManage && hasCategories ? (
            <Button asChild>
              <Link href={newProductHref}>
                <Plus aria-hidden="true" />
                New product
              </Link>
            </Button>
          ) : null}
        </div>
      </header>
      {!canManage && categories.data ? <MenuReadOnlyNotice role={role} /> : null}
      {body}
      {canManage ? (
        <CategoryFormDialog
          organizationId={organizationId}
          open={creatingCategory}
          category={null}
          onOpenChange={setCreatingCategory}
          onSaved={(category) => {
            setSelectedId(category.id);
            setPage(1);
          }}
        />
      ) : null}
    </div>
  );
}
