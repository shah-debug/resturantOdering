import { formatRupees, type PriceBreakdown } from '@app/contracts';

function Row({
  label,
  value,
  emphasis = false,
  testId,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  testId?: string;
}) {
  return (
    <div
      className={`flex justify-between gap-3 ${emphasis ? 'border-t pt-2 text-base font-semibold' : ''}`}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

export function PriceBreakdownList({
  totals,
  isDelivery,
  promotionCode,
}: {
  totals: PriceBreakdown;
  isDelivery: boolean;
  promotionCode: string | null;
}) {
  const taxPercent = totals.taxRateBps / 100;
  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      <Row label="Subtotal" value={formatRupees(totals.subtotalMinor)} testId="price-subtotal" />
      {totals.discountMinor > 0 ? (
        <Row
          label={promotionCode ? `Discount (${promotionCode})` : 'Discount'}
          value={`−${formatRupees(totals.discountMinor)}`}
          testId="price-discount"
        />
      ) : null}
      {isDelivery ? (
        <Row
          label="Delivery fee"
          value={
            totals.deliveryFeeMinor === 0 ||
            totals.deliveryDiscountMinor === totals.deliveryFeeMinor
              ? 'Free'
              : formatRupees(totals.deliveryFeeMinor - totals.deliveryDiscountMinor)
          }
          testId="price-delivery"
        />
      ) : null}
      {totals.taxMinor > 0 ? (
        <Row
          label={totals.pricesIncludeTax ? `Includes tax (${taxPercent}%)` : `Tax (${taxPercent}%)`}
          value={formatRupees(totals.taxMinor)}
          testId="price-tax"
        />
      ) : null}
      {totals.roundingAdjustmentMinor !== 0 ? (
        <Row
          label="Cash rounding"
          value={`${totals.roundingAdjustmentMinor > 0 ? '+' : '−'}${formatRupees(Math.abs(totals.roundingAdjustmentMinor))}`}
        />
      ) : null}
      <Row label="Total" value={formatRupees(totals.totalMinor)} emphasis testId="price-total" />
    </dl>
  );
}
