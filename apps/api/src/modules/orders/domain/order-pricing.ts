import {
  allocateProportionally,
  assertBasisPoints,
  assertMinorAmount,
  BASIS_POINTS_PER_UNIT,
  percentageOf,
  roundHalfUpDivide,
  roundToNearestRupee,
} from '../../../common/money/money.js';

export interface PricingAddOnInput {
  unitPriceMinor: number;
  quantity: number;
}

export interface PricingLineInput {
  unitPriceMinor: number;
  quantity: number;
  addOns: readonly PricingAddOnInput[];
}

export interface OrderPricingInput {
  lines: readonly PricingLineInput[];
  taxRateBps: number;
  pricesIncludeTax: boolean;
  orderDiscountMinor: number;
  deliveryFeeMinor: number;
  deliveryDiscountMinor: number;
  roundToWholeRupee: boolean;
}

export interface PricedLine {
  addOnsTotalMinor: number;
  lineSubtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
}

export interface OrderPricing {
  lines: PricedLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  deliveryFeeMinor: number;
  deliveryDiscountMinor: number;
  roundingAdjustmentMinor: number;
  totalMinor: number;
}

function assertQuantity(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer, got ${value}`);
  }
}

function lineTax(netMinor: number, taxRateBps: number, pricesIncludeTax: boolean): number {
  if (taxRateBps === 0) {
    return 0;
  }
  const denominator = pricesIncludeTax ? BASIS_POINTS_PER_UNIT + taxRateBps : BASIS_POINTS_PER_UNIT;
  return roundHalfUpDivide(netMinor * taxRateBps, denominator);
}

export function priceOrder(input: OrderPricingInput): OrderPricing {
  if (input.lines.length === 0) {
    throw new RangeError('An order needs at least one line');
  }
  assertBasisPoints(input.taxRateBps, 'taxRateBps');
  assertMinorAmount(input.orderDiscountMinor, 'orderDiscountMinor');
  assertMinorAmount(input.deliveryFeeMinor, 'deliveryFeeMinor');
  assertMinorAmount(input.deliveryDiscountMinor, 'deliveryDiscountMinor');
  if (input.deliveryDiscountMinor > input.deliveryFeeMinor) {
    throw new RangeError('deliveryDiscountMinor cannot exceed deliveryFeeMinor');
  }

  const subtotals = input.lines.map((line, lineIndex) => {
    assertMinorAmount(line.unitPriceMinor, `lines[${lineIndex}].unitPriceMinor`);
    assertQuantity(line.quantity, `lines[${lineIndex}].quantity`);
    const addOnsTotalMinor = line.addOns.reduce((sum, addOn, addOnIndex) => {
      assertMinorAmount(
        addOn.unitPriceMinor,
        `lines[${lineIndex}].addOns[${addOnIndex}].unitPriceMinor`,
      );
      assertQuantity(addOn.quantity, `lines[${lineIndex}].addOns[${addOnIndex}].quantity`);
      return sum + addOn.unitPriceMinor * addOn.quantity;
    }, 0);
    const lineSubtotalMinor = (line.unitPriceMinor + addOnsTotalMinor) * line.quantity;
    assertMinorAmount(lineSubtotalMinor, `lines[${lineIndex}] subtotal`);
    return { addOnsTotalMinor, lineSubtotalMinor };
  });

  const subtotalMinor = subtotals.reduce((sum, line) => sum + line.lineSubtotalMinor, 0);
  if (input.orderDiscountMinor > subtotalMinor) {
    throw new RangeError('orderDiscountMinor cannot exceed the order subtotal');
  }

  const discounts = allocateProportionally(
    input.orderDiscountMinor,
    subtotals.map((line) => line.lineSubtotalMinor),
  );

  const lines = subtotals.map((line, index) => {
    const discountMinor = discounts[index] ?? 0;
    return {
      ...line,
      discountMinor,
      taxMinor: lineTax(
        line.lineSubtotalMinor - discountMinor,
        input.taxRateBps,
        input.pricesIncludeTax,
      ),
    };
  });

  const taxMinor = lines.reduce((sum, line) => sum + line.taxMinor, 0);
  const beforeRounding =
    subtotalMinor -
    input.orderDiscountMinor +
    (input.pricesIncludeTax ? 0 : taxMinor) +
    input.deliveryFeeMinor -
    input.deliveryDiscountMinor;
  const totalMinor = input.roundToWholeRupee ? roundToNearestRupee(beforeRounding) : beforeRounding;

  return {
    lines,
    subtotalMinor,
    discountMinor: input.orderDiscountMinor,
    taxMinor,
    deliveryFeeMinor: input.deliveryFeeMinor,
    deliveryDiscountMinor: input.deliveryDiscountMinor,
    roundingAdjustmentMinor: totalMinor - beforeRounding,
    totalMinor,
  };
}

export function percentageDiscount(
  subtotalMinor: number,
  percentBps: number,
  maxDiscountMinor: number | null,
): number {
  const discount = percentageOf(subtotalMinor, percentBps);
  return maxDiscountMinor === null ? discount : Math.min(discount, maxDiscountMinor);
}
