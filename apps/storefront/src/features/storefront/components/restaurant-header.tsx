import { formatRupees, type Storefront } from '@app/contracts';
import { Badge } from '@app/web/ui';
import { Bike, Clock, MapPin, ShoppingBag } from 'lucide-react';
import type { StoreAvailability } from '../availability';
import { takesOnlineOrders } from '../availability';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export function RestaurantHeader({
  storefront,
  availability,
}: {
  storefront: Storefront;
  availability: StoreAvailability;
}) {
  const branches = storefront.branches.filter(takesOnlineOrders);
  const delivery = branches.find((branch) => branch.delivery)?.delivery ?? null;
  const pickup = branches.find((branch) => branch.pickupEnabled) ?? null;
  const locations = [
    ...new Set(
      storefront.branches.map((branch) =>
        branch.area ? `${branch.area}, ${branch.city}` : branch.city,
      ),
    ),
  ];

  return (
    <header className="border-b bg-card">
      <div className="h-2 bg-primary" aria-hidden="true" />
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-start sm:gap-6 sm:py-8">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted text-2xl font-semibold text-muted-foreground sm:size-24">
          {storefront.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logos are restaurant-provided https URLs on any host
            <img
              src={storefront.logoUrl}
              alt={`${storefront.name} logo`}
              className="size-full object-cover"
            />
          ) : (
            <span aria-hidden="true">{initials(storefront.name)}</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">
              {storefront.name}
            </h1>
            {storefront.description ? (
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                {storefront.description}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge
              variant={
                availability.state === 'open'
                  ? 'success'
                  : availability.state === 'closed'
                    ? 'warning'
                    : 'secondary'
              }
            >
              <Clock aria-hidden="true" />
              {availability.label}
            </Badge>
            {availability.detail ? (
              <span className="text-muted-foreground">{availability.detail}</span>
            ) : null}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {locations.length > 0 ? (
              <li className="flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden="true" />
                {locations.join(' · ')}
              </li>
            ) : null}
            {delivery ? (
              <li className="flex items-center gap-1.5">
                <Bike className="size-4" aria-hidden="true" />
                Delivery {formatRupees(delivery.feeMinor)} · about {delivery.estimatedMinutes} min
                {delivery.minimumOrderMinor > 0
                  ? ` · min ${formatRupees(delivery.minimumOrderMinor)}`
                  : ''}
              </li>
            ) : null}
            {pickup ? (
              <li className="flex items-center gap-1.5">
                <ShoppingBag className="size-4" aria-hidden="true" />
                Pickup · ready in about {pickup.preparationMinutes} min
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </header>
  );
}
