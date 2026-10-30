'use client';

import { createPlanRequestSchema, formatRupees } from '@app/contracts';
import { getErrorMessage, getFieldErrors } from '@app/web/api';
import { Alert, Badge, Button, Field, Input, Select } from '@app/web/ui';
import { type FormEvent, useState } from 'react';
import { useCreatePlanMutation, useListPlansQuery } from '../platform-api';
import { usePlatformRole } from './platform-shell';

interface PlanForm {
  code: string;
  name: string;
  rupees: string;
  billingInterval: 'MONTHLY' | 'YEARLY';
  trialDays: string;
}

const EMPTY: PlanForm = {
  code: '',
  name: '',
  rupees: '',
  billingInterval: 'MONTHLY',
  trialDays: '14',
};

export function PlansSection() {
  const role = usePlatformRole();
  const plans = useListPlansQuery();
  const [create, state] = useCreatePlanMutation();
  const [form, setForm] = useState<PlanForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      code: form.code,
      name: form.name,
      priceMinor: Math.round(Number(form.rupees) * 100),
      billingInterval: form.billingInterval,
      trialDays: Number(form.trialDays || 0),
    };
    const parsed = createPlanRequestSchema.safeParse(body);
    if (!parsed.success || !Number.isFinite(body.priceMinor) || form.rupees.trim() === '') {
      const next: Record<string, string> = {};
      for (const issue of parsed.success ? [] : parsed.error.issues) {
        next[String(issue.path[0])] ??= issue.message;
      }
      if (form.rupees.trim() === '' || !Number.isFinite(body.priceMinor)) {
        next.priceMinor = 'Enter a price in rupees';
      }
      setErrors(next);
      return;
    }
    try {
      await create(body).unwrap();
      setForm(EMPTY);
      setShowForm(false);
    } catch (caught) {
      setErrors(getFieldErrors(caught as Parameters<typeof getFieldErrors>[0]));
    }
  }

  return (
    <section aria-labelledby="plans-heading" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="plans-heading" className="text-lg font-semibold">
          Plans
        </h2>
        {role === 'SUPER_ADMIN' && !showForm ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(true)}>
            Add plan
          </Button>
        ) : null}
      </div>
      {showForm ? (
        <form
          onSubmit={(event) => void submit(event)}
          noValidate
          className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-5"
        >
          <Field label="Code" error={errors.code}>
            {(control) => (
              <Input
                {...control}
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
              />
            )}
          </Field>
          <Field label="Name" error={errors.name}>
            {(control) => (
              <Input
                {...control}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            )}
          </Field>
          <Field label="Price (Rs)" error={errors.priceMinor}>
            {(control) => (
              <Input
                {...control}
                inputMode="decimal"
                value={form.rupees}
                onChange={(event) => setForm({ ...form, rupees: event.target.value })}
              />
            )}
          </Field>
          <Field label="Billing">
            {(control) => (
              <Select
                {...control}
                value={form.billingInterval}
                onChange={(event) =>
                  setForm({
                    ...form,
                    billingInterval: event.target.value as PlanForm['billingInterval'],
                  })
                }
              >
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </Select>
            )}
          </Field>
          <Field label="Trial days" error={errors.trialDays}>
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                value={form.trialDays}
                onChange={(event) => setForm({ ...form, trialDays: event.target.value })}
              />
            )}
          </Field>
          {state.error && Object.keys(errors).length === 0 ? (
            <Alert variant="destructive" className="sm:col-span-5">
              {getErrorMessage(state.error)}
            </Alert>
          ) : null}
          <div className="flex gap-2 sm:col-span-5">
            <Button type="submit" disabled={state.isLoading}>
              Create plan
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {plans.data && plans.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No plans yet.</p>
      ) : (
        <ul className="grid gap-2">
          {plans.data?.map((plan) => (
            <li
              key={plan.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm"
            >
              <span className="font-medium">{plan.name}</span>
              <span className="text-muted-foreground">{plan.code}</span>
              <span className="tabular-nums">
                {formatRupees(plan.priceMinor)} /{' '}
                {plan.billingInterval === 'MONTHLY' ? 'month' : 'year'}
              </span>
              {plan.isActive ? null : <Badge variant="secondary">Inactive</Badge>}
              <span className="ml-auto text-muted-foreground">
                {plan.activeSubscriptions} current subscription
                {plan.activeSubscriptions === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
