'use client';

import {
  CART_LIMITS,
  formatRupees,
  groupSelectionError,
  resolveProductSelection,
  type StorefrontAddOnGroup,
  type StorefrontProduct,
} from '@app/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/web/ui';
import { useId, useState } from 'react';
import { QuantityStepper } from './quantity-stepper';

export interface ProductChoice {
  variantId: string;
  addOnIds: string[];
  quantity: number;
}

function initialVariantId(product: StorefrontProduct): string {
  const available = product.variants.filter((variant) => variant.isAvailable);
  return (
    available.find((variant) => variant.isDefault)?.id ??
    available[0]?.id ??
    product.variants[0]?.id ??
    ''
  );
}

function groupHint(group: StorefrontAddOnGroup): string {
  if (group.minSelect === 0) {
    return group.maxSelect === 1 ? 'Optional' : `Optional · up to ${group.maxSelect}`;
  }
  if (group.minSelect === group.maxSelect) {
    return group.minSelect === 1 ? 'Required · choose 1' : `Required · choose ${group.minSelect}`;
  }
  return `Required · choose ${group.minSelect}–${group.maxSelect}`;
}

function priceDelta(priceMinor: number): string {
  return priceMinor > 0 ? `+${formatRupees(priceMinor)}` : '';
}

function AddOnGroupField({
  group,
  selected,
  showError,
  onChange,
}: {
  group: StorefrontAddOnGroup;
  selected: ReadonlySet<string>;
  showError: boolean;
  onChange: (next: Set<string>) => void;
}) {
  const errorId = useId();
  const single = group.minSelect === 1 && group.maxSelect === 1;
  const count = group.addOns.filter((addOn) => selected.has(addOn.id)).length;
  const error = showError ? groupSelectionError(group, count) : null;

  function toggle(addOnId: string, checked: boolean) {
    const next = new Set(selected);
    if (single) {
      for (const addOn of group.addOns) {
        next.delete(addOn.id);
      }
    }
    if (checked) {
      next.add(addOnId);
    } else {
      next.delete(addOnId);
    }
    onChange(next);
  }

  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="mb-2 flex w-full items-baseline justify-between gap-2">
        <span className="font-medium">{group.name}</span>
        <span className="text-xs text-muted-foreground">{groupHint(group)}</span>
      </legend>
      {group.addOns.map((addOn) => {
        const checked = selected.has(addOn.id);
        const atMax = !single && !checked && count >= group.maxSelect;
        const disabled = !addOn.isAvailable || atMax;
        return (
          <label
            key={addOn.id}
            className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-accent'} ${checked ? 'border-primary' : ''}`}
          >
            <input
              type={single ? 'radio' : 'checkbox'}
              name={`group-${group.id}`}
              className="size-4 accent-[var(--primary)]"
              checked={checked}
              disabled={disabled}
              onChange={(event) => toggle(addOn.id, event.target.checked)}
            />
            <span className="flex-1">{addOn.name}</span>
            <span className="text-muted-foreground">
              {addOn.isAvailable ? priceDelta(addOn.priceMinor) : 'Sold out'}
            </span>
          </label>
        );
      })}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function ProductDialogBody({
  product,
  canOrder,
  onAdd,
}: {
  product: StorefrontProduct;
  canOrder: boolean;
  onAdd: (choice: ProductChoice) => void;
}) {
  const [variantId, setVariantId] = useState(() => initialVariantId(product));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [quantity, setQuantity] = useState(1);
  const [attempted, setAttempted] = useState(false);

  const addOnIds = product.addOnGroups.flatMap((group) =>
    group.addOns.filter((addOn) => selected.has(addOn.id)).map((addOn) => addOn.id),
  );
  const result = resolveProductSelection(product, { variantId, addOnIds });
  const showVariants = product.variants.length > 1;

  function submit() {
    setAttempted(true);
    if (result.ok) {
      onAdd({ variantId, addOnIds, quantity });
    }
  }

  return (
    <>
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- menu media may be served from any https origin
        <img
          src={product.imageUrl}
          alt=""
          className="-mx-4 -mt-4 aspect-[16/9] w-[calc(100%+2rem)] max-w-none object-cover sm:-mx-6 sm:-mt-6 sm:w-[calc(100%+3rem)]"
        />
      ) : null}
      <DialogHeader>
        <DialogTitle>{product.name}</DialogTitle>
        {product.description ? (
          <DialogDescription>{product.description}</DialogDescription>
        ) : (
          <DialogDescription className="sr-only">
            Choose options for {product.name}
          </DialogDescription>
        )}
      </DialogHeader>

      {!product.isAvailable ? (
        <p className="rounded-lg bg-muted p-3 text-sm">
          This dish is sold out right now. Please check back later.
        </p>
      ) : null}

      {showVariants ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 flex w-full items-baseline justify-between gap-2">
            <span className="font-medium">Choose a size</span>
            <span className="text-xs text-muted-foreground">Required</span>
          </legend>
          {product.variants.map((variant) => (
            <label
              key={variant.id}
              className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm ${variant.isAvailable ? 'cursor-pointer hover:bg-accent' : 'opacity-60'} ${variant.id === variantId ? 'border-primary' : ''}`}
            >
              <input
                type="radio"
                name={`variant-${product.id}`}
                className="size-4 accent-[var(--primary)]"
                checked={variant.id === variantId}
                disabled={!variant.isAvailable}
                onChange={() => setVariantId(variant.id)}
              />
              <span className="flex-1">{variant.name}</span>
              <span className="text-muted-foreground">
                {variant.isAvailable ? formatRupees(variant.priceMinor) : 'Sold out'}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {product.addOnGroups.map((group) => (
        <AddOnGroupField
          key={group.id}
          group={group}
          selected={selected}
          showError={attempted}
          onChange={setSelected}
        />
      ))}

      <DialogFooter className="sticky -bottom-4 -mx-4 -mb-4 flex-row items-center gap-3 border-t bg-background p-4 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6">
        <QuantityStepper
          value={quantity}
          min={1}
          max={CART_LIMITS.maxQuantityPerLine}
          label={product.name}
          onChange={setQuantity}
          disabled={!product.isAvailable}
        />
        <Button
          type="button"
          className="flex-1"
          disabled={!product.isAvailable || !canOrder}
          onClick={submit}
        >
          {product.isAvailable
            ? `Add to cart${result.ok ? ` · ${formatRupees(result.unitPriceMinor * quantity)}` : ''}`
            : 'Sold out'}
        </Button>
      </DialogFooter>
      {!canOrder && product.isAvailable ? (
        <p className="text-sm text-muted-foreground">
          This restaurant is not taking online orders right now.
        </p>
      ) : null}
    </>
  );
}

export function ProductDialog({
  product,
  canOrder,
  onOpenChange,
  onAdd,
}: {
  product: StorefrontProduct | null;
  canOrder: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (product: StorefrontProduct, choice: ProductChoice) => void;
}) {
  return (
    <Dialog open={product !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] gap-5">
        {product ? (
          <ProductDialogBody
            key={product.id}
            product={product}
            canOrder={canOrder}
            onAdd={(choice) => onAdd(product, choice)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
