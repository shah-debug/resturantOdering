import type { Metadata } from 'next';
import { ProductEditorPage } from '@/features/menu';

export const metadata: Metadata = { title: 'Edit product' };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ organizationId: string; productId: string }>;
}) {
  const { organizationId, productId } = await params;
  return (
    <ProductEditorPage key={productId} organizationId={organizationId} productId={productId} />
  );
}
