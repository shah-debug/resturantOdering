'use client';

import { Bell, BellOff, RefreshCw, WifiOff, X } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@app/web/ui';
import { useLiveOrders } from '../live-orders';

export function LiveStatusIndicator() {
  const { enabled, status, soundEnabled, setSoundEnabled } = useLiveOrders();
  if (!enabled) {
    return null;
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1.5" role="status" aria-live="polite">
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${status === 'live' ? 'bg-success' : status === 'offline' ? 'bg-destructive' : 'bg-warning'}`}
        />
        {status === 'live' ? 'Live' : status === 'offline' ? 'Offline' : 'Connecting…'}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        aria-pressed={soundEnabled}
        aria-label={soundEnabled ? 'Turn off new-order sound' : 'Turn on new-order sound'}
        onClick={() => setSoundEnabled(!soundEnabled)}
      >
        {soundEnabled ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />}
      </Button>
    </div>
  );
}

export function LiveOrdersBanner({ organizationId }: { organizationId: string }) {
  const { enabled, status, incoming, dismiss, refresh } = useLiveOrders();
  if (!enabled) {
    return null;
  }
  const base = `/organizations/${encodeURIComponent(organizationId)}/orders`;
  return (
    <div className="grid gap-2 print:hidden">
      {status === 'offline' ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm"
        >
          <WifiOff className="size-4 text-destructive" aria-hidden="true" />
          <span className="flex-1">
            Live updates are offline. We&apos;re reconnecting and refreshing orders every minute
            until it&apos;s back.
          </span>
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            <RefreshCw aria-hidden="true" />
            Refresh now
          </Button>
        </div>
      ) : null}
      {incoming.length > 0 ? (
        <ul aria-label="New orders" className="grid gap-2">
          {incoming.map((event) => (
            <li
              key={event.orderId}
              className="flex items-center gap-3 rounded-lg border border-warning/60 bg-warning/15 px-4 py-3 text-sm"
            >
              <Bell className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 font-medium">New order #{event.orderNumber}</span>
              <Button asChild size="sm" onClick={() => dismiss(event.orderId)}>
                <Link href={`${base}/${event.orderId}`}>View</Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Dismiss order #${event.orderNumber}`}
                onClick={() => dismiss(event.orderId)}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
