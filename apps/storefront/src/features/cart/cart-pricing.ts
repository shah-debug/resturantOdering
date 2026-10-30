import { resolveSelection, type SelectionResult, type StorefrontCategory } from '@app/contracts';
import type { CartLine } from './cart-slice';

export interface PricedCartLine {
  line: CartLine;
  result: SelectionResult;
  lineTotalMinor: number;
}

export interface PricedCart {
  lines: PricedCartLine[];
  subtotalMinor: number;
  itemCount: number;
  unavailableCount: number;
}

export function priceCart(
  categories: readonly StorefrontCategory[],
  lines: readonly CartLine[],
): PricedCart {
  let subtotalMinor = 0;
  let itemCount = 0;
  let unavailableCount = 0;
  const priced = lines.map((line) => {
    const result = resolveSelection(categories, line);
    const lineTotalMinor = result.ok ? result.unitPriceMinor * line.quantity : 0;
    if (result.ok) {
      subtotalMinor += lineTotalMinor;
      itemCount += line.quantity;
    } else {
      unavailableCount += 1;
    }
    return { line, result, lineTotalMinor };
  });
  return { lines: priced, subtotalMinor, itemCount, unavailableCount };
}
