'use client';

import { formatRupees, REPORT_DEFINITIONS, type SalesReport } from '@app/contracts';
import { Button, Field, Input, Select, Skeleton } from '@app/web/ui';
import { Download, Info } from 'lucide-react';
import { useState } from 'react';
import { ErrorState, isUnavailableError, UnavailableState } from '@/components/states';
import { useGetOrganizationQuery } from '@/features/organizations/organizations-api';
import { useListBranchesQuery } from '@/features/restaurant/restaurant-api';
import {
  type DateRange,
  PRESET_LABELS,
  presetRange,
  type RangePreset,
  todayIn,
} from '../date-range';
import { ordersExportUrl, useGetSalesReportQuery } from '../reports-api';

const PRESETS: RangePreset[] = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'custom'];

const TYPE_LABELS = { DELIVERY: 'Delivery', PICKUP: 'Pickup' } as const;
const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  JAZZCASH: 'JazzCash',
  EASYPAISA: 'Easypaisa',
  BANK_TRANSFER: 'Bank transfer',
};

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-PK').format(value);
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat('en-PK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function StatTile({
  label,
  value,
  definition,
}: {
  label: string;
  value: string;
  definition: string;
}) {
  return (
    <div className="grid content-start gap-1 rounded-xl border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      <dd className="text-xs text-muted-foreground">{definition}</dd>
    </div>
  );
}

function ReportBody({ report }: { report: SalesReport }) {
  const { orders, sales, payments } = report;
  return (
    <div className="grid gap-8">
      <section aria-labelledby="orders-heading" className="grid gap-3">
        <h2 id="orders-heading" className="text-lg font-semibold">
          Orders
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Placed"
            value={formatCount(orders.placed)}
            definition={REPORT_DEFINITIONS.placed}
          />
          <StatTile
            label="Completed"
            value={formatCount(orders.completed)}
            definition={REPORT_DEFINITIONS.completed}
          />
          <StatTile
            label="Cancelled or rejected"
            value={formatCount(orders.cancelled + orders.rejected)}
            definition={`${formatCount(orders.cancelled)} cancelled, ${formatCount(orders.rejected)} rejected.`}
          />
          <StatTile
            label="Still in progress"
            value={formatCount(orders.inProgress)}
            definition="Placed in the period but not yet finished."
          />
        </dl>
      </section>

      <section aria-labelledby="sales-heading" className="grid gap-3">
        <h2 id="sales-heading" className="text-lg font-semibold">
          Sales from completed orders
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Gross order value"
            value={formatRupees(sales.grossOrderValueMinor)}
            definition={REPORT_DEFINITIONS.grossOrderValue}
          />
          <StatTile
            label="Discounts"
            value={formatRupees(sales.discountsMinor)}
            definition={REPORT_DEFINITIONS.discounts}
          />
          <StatTile
            label="Refunds"
            value={formatRupees(sales.refundsMinor)}
            definition={REPORT_DEFINITIONS.refunds}
          />
          <StatTile
            label="Estimated net sales"
            value={formatRupees(sales.estimatedNetSalesMinor)}
            definition={REPORT_DEFINITIONS.estimatedNetSales}
          />
          <StatTile
            label="Delivery charges"
            value={formatRupees(sales.deliveryChargesMinor)}
            definition={REPORT_DEFINITIONS.deliveryCharges}
          />
          <StatTile
            label="Tax recorded"
            value={formatRupees(sales.taxMinor)}
            definition={REPORT_DEFINITIONS.tax}
          />
          <StatTile
            label="Order totals"
            value={formatRupees(sales.orderTotalsMinor)}
            definition={REPORT_DEFINITIONS.orderTotals}
          />
          <StatTile
            label="Average order value"
            value={
              sales.averageOrderValueMinor === null
                ? '—'
                : formatRupees(sales.averageOrderValueMinor)
            }
            definition={REPORT_DEFINITIONS.averageOrderValue}
          />
        </dl>
        <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          These figures are sales, not profit. Food, staff, rent and other costs are not recorded in
          the system.
        </p>
      </section>

      <section aria-labelledby="payments-heading" className="grid gap-3">
        <h2 id="payments-heading" className="text-lg font-semibold">
          Payments recorded
        </h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Recorded payments"
            value={formatRupees(payments.recordedMinor)}
            definition={REPORT_DEFINITIONS.recordedPayments}
          />
          <StatTile
            label="Refunded"
            value={formatRupees(payments.refundedMinor)}
            definition="Refunds recorded on payments received in the period."
          />
          <StatTile
            label="Payments"
            value={formatCount(payments.count)}
            definition="Number of payments received."
          />
        </dl>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="popular-heading" className="grid content-start gap-3">
          <h2 id="popular-heading" className="text-lg font-semibold">
            Popular items
          </h2>
          {report.popularItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed orders in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Top items by quantity in completed orders</caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="py-2 font-medium">
                    Item
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Sold
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Item sales
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.popularItems.map((item) => (
                  <tr key={item.productId} className="border-b last:border-0">
                    <td className="py-2">{item.name}</td>
                    <td className="py-2 text-right tabular-nums">{formatCount(item.quantity)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatRupees(item.salesMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section aria-labelledby="mix-heading" className="grid content-start gap-3">
          <h2 id="mix-heading" className="text-lg font-semibold">
            Order mix
          </h2>
          <table className="w-full text-sm">
            <caption className="sr-only">Completed orders by type and payment method</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-2 font-medium">
                  Group
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Completed
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Order totals
                </th>
              </tr>
            </thead>
            <tbody>
              {report.byType.map((row) => (
                <tr key={row.type} className="border-b">
                  <td className="py-2">{TYPE_LABELS[row.type]}</td>
                  <td className="py-2 text-right tabular-nums">{formatCount(row.completed)}</td>
                  <td className="py-2 text-right tabular-nums">{formatRupees(row.totalMinor)}</td>
                </tr>
              ))}
              {report.byPaymentMethod.map((row) => (
                <tr key={row.method} className="border-b last:border-0">
                  <td className="py-2">Paid by {METHOD_LABELS[row.method] ?? row.method}</td>
                  <td className="py-2 text-right tabular-nums">{formatCount(row.completed)}</td>
                  <td className="py-2 text-right tabular-nums">{formatRupees(row.totalMinor)}</td>
                </tr>
              ))}
              {report.byType.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-2 text-muted-foreground">
                    No completed orders in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>

      <section aria-labelledby="daily-heading" className="grid gap-3">
        <h2 id="daily-heading" className="text-lg font-semibold">
          By day
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <caption className="sr-only">Orders per day in {report.range.timezone} time</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-2 font-medium">
                  Day
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Placed
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Completed
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Cancelled
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Order totals
                </th>
              </tr>
            </thead>
            <tbody>
              {report.daily.map((day) => (
                <tr key={day.date} className="border-b last:border-0">
                  <td className="py-2">{formatDay(day.date)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCount(day.placed)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCount(day.completed)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCount(day.cancelled)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatRupees(day.orderTotalsMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function ReportsPage({ organizationId }: { organizationId: string }) {
  const organization = useGetOrganizationQuery(organizationId);
  const branches = useListBranchesQuery(organizationId);
  const timezone = organization.data?.timezone ?? 'Asia/Karachi';
  const today = todayIn(timezone);
  const [preset, setPreset] = useState<RangePreset>('last7');
  const [custom, setCustom] = useState<DateRange>(() => presetRange('last7', today));
  const [branchId, setBranchId] = useState('');
  const range = preset === 'custom' ? custom : presetRange(preset, today);
  const validCustom = range.from <= range.to;
  const args = { organizationId, ...range, branchId: branchId || undefined };
  const report = useGetSalesReportQuery(args, { skip: !organization.data || !validCustom });
  const branchList = branches.data ?? [];

  if (isUnavailableError(report.error)) {
    return <UnavailableState error={report.error} />;
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Days run midnight to midnight in {timezone} time. Orders count on the day they were
            placed.
          </p>
        </div>
        <Button asChild variant="outline" aria-disabled={!validCustom}>
          <a href={ordersExportUrl(args)} download>
            <Download aria-hidden="true" />
            Export orders (CSV)
          </a>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[12rem_repeat(3,minmax(0,1fr))]">
        <Field label="Period">
          {(control) => (
            <Select
              {...control}
              value={preset}
              onChange={(event) => setPreset(event.target.value as RangePreset)}
            >
              {PRESETS.map((option) => (
                <option key={option} value={option}>
                  {PRESET_LABELS[option]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {preset === 'custom' ? (
          <>
            <Field label="From">
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={custom.from}
                  max={today}
                  onChange={(event) =>
                    setCustom((current) => ({ ...current, from: event.target.value }))
                  }
                />
              )}
            </Field>
            <Field
              label="To"
              error={validCustom ? undefined : 'Choose an end date after the start date'}
            >
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={custom.to}
                  onChange={(event) =>
                    setCustom((current) => ({ ...current, to: event.target.value }))
                  }
                />
              )}
            </Field>
          </>
        ) : null}
        {branchList.length > 1 ? (
          <Field label="Branch">
            {(control) => (
              <Select
                {...control}
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
              >
                <option value="">All branches</option>
                {branchList.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
      </div>

      {report.isLoading || organization.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-4" role="status">
          <span className="sr-only">Loading report…</span>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : report.error && !report.data ? (
        <ErrorState
          title="We couldn't load the report"
          error={report.error}
          onRetry={() => void report.refetch()}
          retrying={report.isFetching}
        />
      ) : report.data ? (
        <div aria-busy={report.isFetching}>
          <ReportBody report={report.data} />
        </div>
      ) : null}
    </div>
  );
}
