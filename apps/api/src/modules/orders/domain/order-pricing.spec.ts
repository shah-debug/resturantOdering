import { type OrderPricingInput, percentageDiscount, priceOrder } from './order-pricing';

const baseInput: OrderPricingInput = {
  lines: [{ unitPriceMinor: 145_000, quantity: 1, addOns: [] }],
  taxRateBps: 0,
  pricesIncludeTax: false,
  orderDiscountMinor: 0,
  deliveryFeeMinor: 0,
  deliveryDiscountMinor: 0,
  roundToWholeRupee: false,
};

function expectTotalsMatchDatabaseRules(input: OrderPricingInput): void {
  const pricing = priceOrder(input);
  const sum = (pick: (line: (typeof pricing.lines)[number]) => number) =>
    pricing.lines.reduce((total, line) => total + pick(line), 0);

  expect(pricing.subtotalMinor).toBe(sum((line) => line.lineSubtotalMinor));
  expect(pricing.discountMinor).toBe(sum((line) => line.discountMinor));
  expect(pricing.taxMinor).toBe(sum((line) => line.taxMinor));
  expect(pricing.totalMinor).toBe(
    pricing.subtotalMinor -
      pricing.discountMinor +
      (input.pricesIncludeTax ? 0 : pricing.taxMinor) +
      pricing.deliveryFeeMinor -
      pricing.deliveryDiscountMinor +
      pricing.roundingAdjustmentMinor,
  );
}

describe('priceOrder', () => {
  it('multiplies unit price plus add-ons by quantity', () => {
    const pricing = priceOrder({
      ...baseInput,
      lines: [
        {
          unitPriceMinor: 55_000,
          quantity: 2,
          addOns: [
            { unitPriceMinor: 6_000, quantity: 2 },
            { unitPriceMinor: 0, quantity: 1 },
          ],
        },
      ],
    });
    expect(pricing.lines[0]).toMatchObject({
      addOnsTotalMinor: 12_000,
      lineSubtotalMinor: 134_000,
    });
    expect(pricing.totalMinor).toBe(134_000);
  });

  it('adds exclusive tax per line after discounts', () => {
    const pricing = priceOrder({
      ...baseInput,
      lines: [
        { unitPriceMinor: 145_000, quantity: 1, addOns: [] },
        { unitPriceMinor: 15_000, quantity: 1, addOns: [] },
      ],
      taxRateBps: 1_600,
      orderDiscountMinor: 16_000,
    });
    expect(pricing.lines.map((line) => line.discountMinor)).toEqual([14_500, 1_500]);
    expect(pricing.lines.map((line) => line.taxMinor)).toEqual([20_880, 2_160]);
    expect(pricing.totalMinor).toBe(160_000 - 16_000 + 23_040);
  });

  it('extracts inclusive tax without changing the total', () => {
    const pricing = priceOrder({
      ...baseInput,
      lines: [{ unitPriceMinor: 116_000, quantity: 1, addOns: [] }],
      taxRateBps: 1_600,
      pricesIncludeTax: true,
    });
    expect(pricing.taxMinor).toBe(16_000);
    expect(pricing.totalMinor).toBe(116_000);
  });

  it('applies delivery fee and delivery discount outside the item subtotal', () => {
    const pricing = priceOrder({
      ...baseInput,
      deliveryFeeMinor: 15_000,
      deliveryDiscountMinor: 15_000,
    });
    expect(pricing.totalMinor).toBe(145_000);
  });

  it('rounds cash totals to the nearest rupee and records the adjustment', () => {
    const pricing = priceOrder({
      ...baseInput,
      lines: [{ unitPriceMinor: 12_345, quantity: 1, addOns: [] }],
      taxRateBps: 1_600,
      roundToWholeRupee: true,
    });
    expect(pricing.taxMinor).toBe(1_975);
    expect(pricing.totalMinor).toBe(14_300);
    expect(pricing.roundingAdjustmentMinor).toBe(-20);
  });

  it('produces totals that satisfy the database consistency rules', () => {
    expectTotalsMatchDatabaseRules({
      lines: [
        { unitPriceMinor: 99_999, quantity: 3, addOns: [{ unitPriceMinor: 1_111, quantity: 2 }] },
        { unitPriceMinor: 12_345, quantity: 7, addOns: [] },
        { unitPriceMinor: 1, quantity: 1, addOns: [] },
      ],
      taxRateBps: 1_300,
      pricesIncludeTax: false,
      orderDiscountMinor: 33_333,
      deliveryFeeMinor: 15_000,
      deliveryDiscountMinor: 5_000,
      roundToWholeRupee: true,
    });
  });

  it('rejects invalid input', () => {
    expect(() => priceOrder({ ...baseInput, lines: [] })).toThrow(RangeError);
    expect(() =>
      priceOrder({ ...baseInput, lines: [{ unitPriceMinor: 100, quantity: 0, addOns: [] }] }),
    ).toThrow(RangeError);
    expect(() => priceOrder({ ...baseInput, orderDiscountMinor: 145_001 })).toThrow(RangeError);
    expect(() => priceOrder({ ...baseInput, deliveryDiscountMinor: 1 })).toThrow(RangeError);
    expect(() => priceOrder({ ...baseInput, taxRateBps: 10_001 })).toThrow(RangeError);
    expect(() =>
      priceOrder({ ...baseInput, lines: [{ unitPriceMinor: 10.5, quantity: 1, addOns: [] }] }),
    ).toThrow(RangeError);
  });
});

describe('percentageDiscount', () => {
  it('applies the percentage when it is below the cap', () => {
    expect(percentageDiscount(100_000, 1_000, 30_000)).toBe(10_000);
  });

  it('caps the discount', () => {
    expect(percentageDiscount(450_000, 1_000, 30_000)).toBe(30_000);
  });

  it('applies no cap when none is configured', () => {
    expect(percentageDiscount(450_000, 1_000, null)).toBe(45_000);
  });
});
