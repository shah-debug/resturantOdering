'use client';

import type { Plan, UpdatePlanRequest } from '@app/contracts';
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
  Input,
  Label,
} from '@app/web/ui';
import { type FormEvent, useState } from 'react';
import { useUpdatePlanMutation } from '../billing-admin-api';

type LimitKey = 'maxBranches' | 'maxProducts' | 'maxRiders' | 'maxMembers';

const LIMITS: { key: LimitKey; label: string }[] = [
  { key: 'maxBranches', label: 'Branches' },
  { key: 'maxProducts', label: 'Menu items' },
  { key: 'maxRiders', label: 'Active riders' },
  { key: 'maxMembers', label: 'Team members' },
];

export function limitText(limit: number | null, one: string, many: string): string {
  return limit === null ? `unlimited ${many}` : `${limit} ${limit === 1 ? one : many}`;
}

function toLimit(value: string): number | null | 'invalid' {
  if (value.trim() === '') {
    return null;
  }
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 100_000 ? number : 'invalid';
}

export function PlanEditDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const [update, state] = useUpdatePlanMutation();
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(String(plan.priceMinor / 100));
  const [limits, setLimits] = useState<Record<LimitKey, string>>({
    maxBranches: plan.maxBranches?.toString() ?? '',
    maxProducts: plan.maxProducts?.toString() ?? '',
    maxRiders: plan.maxRiders?.toString() ?? '',
    maxMembers: plan.maxMembers?.toString() ?? '',
  });
  const [trialDays, setTrialDays] = useState(String(plan.trialDays));
  const [graceDays, setGraceDays] = useState(String(plan.graceDays));
  const [isActive, setIsActive] = useState(plan.isActive);
  const [isDefault, setIsDefault] = useState(plan.isDefault);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const priceMinor = Math.round(Number(price) * 100);
    const parsedLimits = Object.fromEntries(
      LIMITS.map(({ key }) => [key, toLimit(limits[key])]),
    ) as Record<LimitKey, number | null | 'invalid'>;
    if (!Number.isFinite(priceMinor) || priceMinor < 0) {
      setError('Enter a valid price in rupees.');
      return;
    }
    if (Object.values(parsedLimits).includes('invalid')) {
      setError('Limits must be whole numbers of at least 1, or empty for unlimited.');
      return;
    }
    const body: UpdatePlanRequest = {
      name: name.trim(),
      priceMinor,
      maxBranches: parsedLimits.maxBranches as number | null,
      maxProducts: parsedLimits.maxProducts as number | null,
      maxRiders: parsedLimits.maxRiders as number | null,
      maxMembers: parsedLimits.maxMembers as number | null,
      trialDays: Number(trialDays),
      graceDays: Number(graceDays),
      isActive,
      isDefault,
    };
    try {
      await update({ planId: plan.id, body }).unwrap();
      onClose();
    } catch (caught) {
      setError(getErrorMessage(caught as Parameters<typeof getErrorMessage>[0]));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-xl">
        <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Edit {plan.code}</DialogTitle>
            <DialogDescription>
              Price changes apply to new subscriptions and plan changes. Existing subscriptions keep
              the price they started with. Limits apply to everyone on this plan immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              {(control) => (
                <Input
                  {...control}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            <Field
              label={`Price (Rs per ${plan.billingInterval === 'MONTHLY' ? 'month' : 'year'})`}
            >
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              )}
            </Field>
            {LIMITS.map(({ key, label }) => (
              <Field key={key} label={label} hint="Empty means unlimited">
                {(control) => (
                  <Input
                    {...control}
                    inputMode="numeric"
                    value={limits[key]}
                    onChange={(event) => setLimits({ ...limits, [key]: event.target.value })}
                  />
                )}
              </Field>
            ))}
            <Field label="Trial days">
              {(control) => (
                <Input
                  {...control}
                  inputMode="numeric"
                  value={trialDays}
                  onChange={(event) => setTrialDays(event.target.value)}
                />
              )}
            </Field>
            <Field
              label="Grace period (days)"
              hint="How long a restaurant keeps working after a missed payment"
            >
              {(control) => (
                <Input
                  {...control}
                  inputMode="numeric"
                  value={graceDays}
                  onChange={(event) => setGraceDays(event.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <Label className="flex items-center gap-2 font-normal">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              Available for new subscriptions
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(event) => setIsDefault(event.target.checked)}
              />
              Default trial plan for new restaurants
            </Label>
          </div>
          {error ? <Alert variant="destructive">{error}</Alert> : null}
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
