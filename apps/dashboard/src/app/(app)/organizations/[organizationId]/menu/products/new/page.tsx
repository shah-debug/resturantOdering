import type { Metadata } from 'next';
import { ProductEditorPage } from '@/features/menu';
import { firstParam, type SearchParams } from '@/lib/search-params';

export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ organizationId }, query] = await Promise.all([params, searchParams]);
  return (
    <ProductEditorPage
      organizationId={organizationId}
      initialCategoryId={firstParam(query.categoryId)}
    />
  );
}
