'use client';

import { Clock, MapPin, ShoppingBag, Truck } from 'lucide-react';
import type { Branch, Organization } from '@app/contracts';
import { Badge } from '@app/web/ui';
import { RestaurantMark } from '@/components/shell/restaurant-mark';
import { dayOfWeekIn, describeDay } from '../hours';
import { formatRupees } from '../money';

export function formatAddress(branch: Pick<Branch, 'addressLine' | 'area' | 'city'>): string {
  return [branch.addressLine, branch.area, branch.city].filter(Boolean).join(', ');
}

export function StorefrontPreview({
  organization,
  branch,
}: {
  organization: Organization;
  branch: Branch | null;
}) {
  const today = dayOfWeekIn(organization.timezone);

  return (
    <section
      aria-label="Storefront preview"
      className="overflow-hidden rounded-xl border bg-card shadow-xs"
    >
      <div
        className="h-16 bg-muted"
        style={organization.primaryColor ? { backgroundColor: organization.primaryColor } : {}}
        aria-hidden="true"
      />
      <div className="grid gap-4 px-4 pb-5 sm:px-6">
        <div className="-mt-8 flex items-end gap-3">
          <RestaurantMark
            name={organization.name}
            logoUrl={organization.logoUrl}
            className="size-16 rounded-xl border-4 border-card"
          />
        </div>
        <div className="grid gap-1">
          <p className="text-lg font-semibold tracking-tight">{organization.name}</p>
          <p className="text-sm text-muted-foreground">
            {organization.description ?? 'Add a description so customers know what you serve.'}
          </p>
        </div>
        {branch ? (
          <dl className="grid gap-2 text-sm">
            <div className="flex items-start gap-2">
              <dt className="sr-only">Address</dt>
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <dd>{formatAddress(branch)}</dd>
            </div>
            <div className="flex items-start gap-2">
              <dt className="sr-only">Today&apos;s hours</dt>
              <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <dd>Today: {describeDay(branch.openingHours, today)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Add your location to show your address and hours.
          </p>
        )}
        {branch && (branch.deliveryEnabled || branch.pickupEnabled) ? (
          <ul className="flex flex-wrap gap-2" aria-label="Ordering options">
            {branch.deliveryEnabled ? (
              <li>
                <Badge variant="secondary">
                  <Truck aria-hidden="true" />
                  Delivery
                  {branch.delivery
                    ? ` · ${formatRupees(branch.delivery.feeMinor)} · ${branch.delivery.estimatedMinutes} min`
                    : ''}
                </Badge>
              </li>
            ) : null}
            {branch.pickupEnabled ? (
              <li>
                <Badge variant="secondary">
                  <ShoppingBag aria-hidden="true" />
                  Pickup · ready in {branch.preparationMinutes} min
                </Badge>
              </li>
            ) : null}
            {branch.deliveryEnabled && branch.delivery && branch.delivery.minimumOrderMinor > 0 ? (
              <li>
                <Badge variant="outline">
                  Minimum order {formatRupees(branch.delivery.minimumOrderMinor)}
                </Badge>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
