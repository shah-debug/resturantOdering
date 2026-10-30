'use client';

import { formatRupees, type PlatformOrganizationDetail } from '@app/contracts';
import { getErrorMessage } from '@app/web/api';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Select,
  Textarea,
} from '@app/web/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { ErrorState, LoadingState } from '@/components/states';
import {
  useAssignSubscriptionMutation,
  useChangeRestaurantStatusMutation,
  useGetPlatformRestaurantQuery,
  useListPlansQuery,
} from '../platform-api';
import { AuditList } from './audit-list';
import { usePlatformRole } from './platform-shell';
import { statusBadge } from './restaurants-page';

type Target = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

const ACTION_LABELS: Record<Target, string> = {
  ACTIVE: 'Reactivate',
  SUSPENDED: 'Suspend',
  CLOSED: 'Close permanently',
};

function StatusDialog({
  restaurant,
  target,
  onClose,
}: {
  restaurant: PlatformOrganizationDetail;
  target: Target;
  onClose: () => void;
}) {
  const [change, state] = useChangeRestaurantStatusMutation();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 5) {
      setError('Give a reason of at least 5 characters. It is saved in the audit log.');
      return;
    }
    try {
      await change({
        organizationId: restaurant.id,
        body: { status: target, expectedStatus: restaurant.status, reason: reason.trim() },
      }).unwrap();
      onClose();
    } catch (caught) {
      setError(getErrorMessage(caught as Parameters<typeof getErrorMessage>[0]));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {ACTION_LABELS[target]} {restaurant.name}
            </DialogTitle>
            <DialogDescription>
              {target === 'SUSPENDED'
                ? 'Staff lose dashboard access and the ordering site goes offline until you reactivate it.'
                : target === 'CLOSED'
                  ? 'This cannot be undone. Staff lose access and the ordering site goes offline for good.'
                  : 'Staff regain access and the ordering site comes back online.'}
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason" error={error ?? undefined}>
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={target === 'ACTIVE' ? 'default' : 'destructive'}
              disabled={state.isLoading}
            >
              {ACTION_LABELS[target]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({
  restaurant,
  onClose,
}: {
  restaurant: PlatformOrganizationDetail;
  onClose: () => void;
}) {
  const plans = useListPlansQuery();
  const [assign, state] = useAssignSubscriptionMutation();
  const active = (plans.data ?? []).filter((plan) => plan.isActive);
  const [planId, setPlanId] = useState(restaurant.subscription?.planId ?? '');
  const [status, setStatus] = useState<'ACTIVE' | 'TRIALING'>('ACTIVE');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const chosen = planId || active[0]?.id || '';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosen) {
      setError('Create a plan first.');
      return;
    }
    if (reason.trim().length < 5) {
      setError('Give a reason of at least 5 characters. It is saved in the audit log.');
      return;
    }
    try {
      await assign({
        organizationId: restaurant.id,
        body: { planId: chosen, status, reason: reason.trim() },
      }).unwrap();
      onClose();
    } catch (caught) {
      setError(getErrorMessage(caught as Parameters<typeof getErrorMessage>[0]));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>
              The current subscription is cancelled and replaced. No payment is taken.
            </DialogDescription>
          </DialogHeader>
          <Field label="Plan">
            {(control) => (
              <Select
                {...control}
                value={chosen}
                onChange={(event) => setPlanId(event.target.value)}
              >
                {active.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {formatRupees(plan.priceMinor)} /{' '}
                    {plan.billingInterval === 'MONTHLY' ? 'month' : 'year'}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Start as">
            {(control) => (
              <Select
                {...control}
                value={status}
                onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'TRIALING')}
              >
                <option value="ACTIVE">Active</option>
                <option value="TRIALING">Trial</option>
              </Select>
            )}
          </Field>
          <Field label="Reason" error={error ?? undefined}>
            {(control) => (
              <Textarea
                {...control}
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={state.isLoading}>
              Save plan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RestaurantDetailPage({ organizationId }: { organizationId: string }) {
  const role = usePlatformRole();
  const query = useGetPlatformRestaurantQuery(organizationId);
  const [target, setTarget] = useState<Target | null>(null);
  const [changingPlan, setChangingPlan] = useState(false);

  if (query.isLoading) {
    return <LoadingState label="Loading restaurant…" />;
  }
  if (!query.data) {
    return (
      <ErrorState
        title="We couldn't load this restaurant"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  const restaurant = query.data;
  const isAdmin = role === 'SUPER_ADMIN';
  const targets: Target[] =
    restaurant.status === 'ACTIVE'
      ? ['SUSPENDED', 'CLOSED']
      : restaurant.status === 'SUSPENDED'
        ? ['ACTIVE', 'CLOSED']
        : [];

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href="/platform/restaurants"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All restaurants
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{restaurant.name}</h1>
          {statusBadge(restaurant.status)}
        </div>
        <p className="text-sm text-muted-foreground">
          /{restaurant.slug} · {restaurant.timezone} · created {restaurant.createdAt.slice(0, 10)}
        </p>
      </div>

      {isAdmin && targets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {targets.map((option) => (
            <Button
              key={option}
              type="button"
              variant={option === 'ACTIVE' ? 'default' : 'outline'}
              onClick={() => setTarget(option)}
            >
              {ACTION_LABELS[option]}
            </Button>
          ))}
          <Button type="button" variant="outline" onClick={() => setChangingPlan(true)}>
            Change plan
          </Button>
        </div>
      ) : !isAdmin ? (
        <Alert title="Read-only">Support staff can view restaurants but not change them.</Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="account-heading"
          className="grid content-start gap-2 rounded-xl border bg-card p-4 text-sm"
        >
          <h2 id="account-heading" className="font-semibold">
            Account
          </h2>
          <p>
            Owner:{' '}
            {restaurant.owner
              ? `${restaurant.owner.fullName} (${restaurant.owner.email})`
              : 'No active owner'}
          </p>
          <p>
            Contact:{' '}
            {[restaurant.contactEmail, restaurant.contactPhone].filter(Boolean).join(' · ') ||
              'Not set'}
          </p>
          <p>
            {restaurant.memberCount} active team member{restaurant.memberCount === 1 ? '' : 's'} ·{' '}
            {restaurant.branches.length} branch
            {restaurant.branches.length === 1 ? '' : 'es'}
          </p>
          <p>
            Setup{' '}
            {restaurant.onboardingCompletedAt
              ? `completed ${restaurant.onboardingCompletedAt.slice(0, 10)}`
              : 'not finished'}
          </p>
          <p>
            Orders in the last 30 days: {restaurant.activity.ordersLast30Days} (
            {restaurant.activity.completedLast30Days} completed)
            {restaurant.activity.lastOrderAt
              ? ` · last order ${restaurant.activity.lastOrderAt.slice(0, 10)}`
              : ''}
          </p>
        </section>

        <section
          aria-labelledby="subscription-heading"
          className="grid content-start gap-2 rounded-xl border bg-card p-4 text-sm"
        >
          <h2 id="subscription-heading" className="font-semibold">
            Subscription
          </h2>
          {restaurant.subscriptions.length === 0 ? (
            <p className="text-muted-foreground">No plan has been assigned.</p>
          ) : (
            <ul className="grid gap-2">
              {restaurant.subscriptions.map((entry) => (
                <li key={entry.id}>
                  <span className="font-medium">{entry.planName}</span> ·{' '}
                  {entry.status.toLowerCase()} · {formatRupees(entry.priceMinor)} /{' '}
                  {entry.billingInterval === 'MONTHLY' ? 'month' : 'year'}
                  <span className="block text-xs text-muted-foreground">
                    {entry.currentPeriodStart.slice(0, 10)} → {entry.currentPeriodEnd.slice(0, 10)}
                    {entry.canceledAt ? ` · cancelled ${entry.canceledAt.slice(0, 10)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="audit-heading" className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 id="audit-heading" className="text-lg font-semibold">
            Recent activity
          </h2>
          <Link
            href={`/platform/audit?organizationId=${restaurant.id}`}
            className="text-sm underline underline-offset-4"
          >
            Full audit log
          </Link>
        </div>
        <AuditList entries={restaurant.recentAudit} showOrganization={false} />
      </section>

      {target ? (
        <StatusDialog restaurant={restaurant} target={target} onClose={() => setTarget(null)} />
      ) : null}
      {changingPlan ? (
        <PlanDialog restaurant={restaurant} onClose={() => setChangingPlan(false)} />
      ) : null}
    </div>
  );
}
