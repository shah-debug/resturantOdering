import { formatRupees, type StorefrontProduct } from '@app/contracts';
import { Badge } from '@app/web/ui';
import { Plus } from 'lucide-react';

export function productPriceLabel(product: StorefrontProduct): string {
  const available = product.variants.filter((variant) => variant.isAvailable);
  const pool = available.length > 0 ? available : product.variants;
  if (pool.length === 0) {
    return '';
  }
  const lowest = Math.min(...pool.map((variant) => variant.priceMinor));
  return product.variants.length > 1 ? `From ${formatRupees(lowest)}` : formatRupees(lowest);
}

export function ProductCard({
  product,
  onSelect,
}: {
  product: StorefrontProduct;
  onSelect: (product: StorefrontProduct) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(product)}
        aria-label={`${product.name}, ${productPriceLabel(product)}${product.isAvailable ? '' : ', sold out'}`}
        className="group flex h-full w-full items-stretch gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-4"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="font-medium break-words">{product.name}</h3>
          {product.description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
          ) : null}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <span className="text-sm font-semibold">{productPriceLabel(product)}</span>
            {product.isAvailable ? null : <Badge variant="secondary">Sold out</Badge>}
          </div>
        </div>
        <div className="relative size-24 shrink-0 sm:size-28">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- menu media may be served from any https origin
            <img
              src={product.imageUrl}
              alt=""
              loading="lazy"
              className={`size-full rounded-lg object-cover ${product.isAvailable ? '' : 'opacity-50 grayscale'}`}
            />
          ) : (
            <div className="size-full rounded-lg bg-muted" aria-hidden="true" />
          )}
          {product.isAvailable ? (
            <span
              className="absolute right-1.5 bottom-1.5 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-105"
              aria-hidden="true"
            >
              <Plus className="size-4" />
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
}
