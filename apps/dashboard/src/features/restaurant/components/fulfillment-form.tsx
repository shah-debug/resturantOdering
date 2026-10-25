'use client';

import { ShoppingBag, Truck } from 'lucide-react';
import { type ComponentProps, type FormEvent, type ReactNode, useId, useState } from 'react';
import {
  type Branch,
  deliverySettingsSchema,
  type FulfillmentRequest,
  fulfillmentRequestSchema,
} from '@app/contracts';
import { getFieldErrors } from '@app/web/api';
import { Field, Input, Switch } from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { type FieldErrors, validateForm } from '@/lib/form';
import { paisaToRupees, rupeesToPaisa } from '../money';
import { useUpdateFulfillmentMutation } from '../restaurant-api';
import { FormActions, SavedNotice, type StepFormProps } from './form-parts';

export interface FulfillmentDraft {
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  preparationMinutes: string;
  deliveryFee: string;
  minimumOrder: string;
  estimatedMinutes: string;
}

const SERVER_FIELD_ALIASES: Record<string, string> = {
  feeMinor: 'deliveryFee',
  minimumOrderMinor: 'minimumOrder',
};

function parseMinutes(value: string): number | null {
  return /^\d{1,3}$/.test(value.trim()) ? Number(value.trim()) : null;
}

export function buildFulfillmentRequest(
  draft: FulfillmentDraft,
): { success: true; data: FulfillmentRequest } | { success: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const preparationMinutes = parseMinutes(draft.preparationMinutes);
  if (preparationMinutes === null || preparationMinutes < 5 || preparationMinutes > 240) {
    errors.preparationMinutes = 'Enter between 5 and 240 minutes';
  }
  if (!draft.deliveryEnabled && !draft.pickupEnabled) {
    errors.pickupEnabled = 'Offer delivery, pickup or both';
  }

  let delivery: FulfillmentRequest['delivery'] = null;
  if (draft.deliveryEnabled) {
    const feeMinor = rupeesToPaisa(draft.deliveryFee);
    const minimumOrderMinor = rupeesToPaisa(draft.minimumOrder);
    const estimatedMinutes = parseMinutes(draft.estimatedMinutes);
    const parsed = deliverySettingsSchema.safeParse({
      feeMinor,
      minimumOrderMinor,
      estimatedMinutes,
    });
    if (parsed.success) {
      delivery = parsed.data;
    } else {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        if (field === 'feeMinor') {
          errors.deliveryFee ??= 'Enter a fee in rupees between 0 and 10,000, e.g. 150';
        } else if (field === 'minimumOrderMinor') {
          errors.minimumOrder ??= 'Enter an amount in rupees between 0 and 100,000, e.g. 500';
        } else {
          errors.estimatedMinutes ??= 'Enter between 5 and 240 minutes';
        }
      }
    }
  }

  if (Object.keys(errors).length > 0 || preparationMinutes === null) {
    return { success: false, errors };
  }
  return validateForm(fulfillmentRequestSchema, {
    deliveryEnabled: draft.deliveryEnabled,
    pickupEnabled: draft.pickupEnabled,
    preparationMinutes,
    delivery,
  });
}

function MethodToggle({
  icon,
  label,
  description,
  checked,
  onCheckedChange,
  describedBy,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  describedBy: string | undefined;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 sm:p-4">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="grid flex-1 gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p id={`${id}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={[`${id}-description`, describedBy].filter(Boolean).join(' ')}
      />
    </div>
  );
}

function RupeeInput(props: ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
      >
        Rs
      </span>
      <Input {...props} inputMode="decimal" className="pl-9" />
    </div>
  );
}

export function FulfillmentForm({
  organizationId,
  branch,
  mode,
  onSaved,
  onBack,
}: StepFormProps & { branch: Branch }) {
  const [updateFulfillment, { isLoading, isSuccess, error, reset }] =
    useUpdateFulfillmentMutation();
  const [draft, setDraft] = useState<FulfillmentDraft>({
    deliveryEnabled: branch.deliveryEnabled,
    pickupEnabled: branch.pickupEnabled,
    preparationMinutes: String(branch.preparationMinutes),
    deliveryFee: branch.delivery ? paisaToRupees(branch.delivery.feeMinor) : '',
    minimumOrder: branch.delivery ? paisaToRupees(branch.delivery.minimumOrderMinor) : '',
    estimatedMinutes: branch.delivery ? String(branch.delivery.estimatedMinutes) : '',
  });
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const serverErrors = Object.fromEntries(
    Object.entries(getFieldErrors(error)).map(([field, message]) => [
      SERVER_FIELD_ALIASES[field] ?? field,
      message,
    ]),
  );
  const errors = { ...serverErrors, ...clientErrors };
  const methodErrorId = useId();

  function change<K extends keyof FulfillmentDraft>(field: K, value: FulfillmentDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const result = buildFulfillmentRequest(draft);
    if (!result.success) {
      setClientErrors(result.errors);
      return;
    }
    setClientErrors({});
    const response = await updateFulfillment({
      organizationId,
      branchId: branch.id,
      body: result.data,
    });
    if (!('error' in response)) {
      onSaved?.();
    }
  }

  const methodError = errors.pickupEnabled ?? errors.deliveryEnabled;

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-5">
      <SavedNotice show={mode === 'settings' && isSuccess}>Delivery and pickup saved.</SavedNotice>
      <FormError error={error} />
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-medium">How customers get their food</legend>
        <MethodToggle
          icon={<Truck className="size-5" aria-hidden="true" />}
          label="Delivery"
          description="Your riders bring orders to the customer."
          checked={draft.deliveryEnabled}
          onCheckedChange={(checked) => change('deliveryEnabled', checked)}
          describedBy={methodError ? methodErrorId : undefined}
        />
        <MethodToggle
          icon={<ShoppingBag className="size-5" aria-hidden="true" />}
          label="Pickup"
          description="Customers collect orders from your location."
          checked={draft.pickupEnabled}
          onCheckedChange={(checked) => change('pickupEnabled', checked)}
          describedBy={methodError ? methodErrorId : undefined}
        />
        {methodError ? (
          <p id={methodErrorId} role="alert" className="text-sm text-destructive">
            {methodError}
          </p>
        ) : null}
      </fieldset>
      <Field
        label="Preparation time (minutes)"
        hint="How long a typical order takes before it is ready."
        error={errors.preparationMinutes}
        className="sm:max-w-xs"
      >
        {(control) => (
          <Input
            {...control}
            name="preparationMinutes"
            inputMode="numeric"
            value={draft.preparationMinutes}
            onChange={(event) => change('preparationMinutes', event.target.value)}
          />
        )}
      </Field>
      {draft.deliveryEnabled ? (
        <fieldset className="grid gap-4 rounded-lg border p-3 sm:p-4">
          <legend className="px-1 text-sm font-medium">Delivery details</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Delivery fee" hint="In rupees, e.g. 150" error={errors.deliveryFee}>
              {(control) => (
                <RupeeInput
                  {...control}
                  name="deliveryFee"
                  value={draft.deliveryFee}
                  onChange={(event) => change('deliveryFee', event.target.value)}
                />
              )}
            </Field>
            <Field label="Minimum order" hint="In rupees, 0 for none" error={errors.minimumOrder}>
              {(control) => (
                <RupeeInput
                  {...control}
                  name="minimumOrder"
                  value={draft.minimumOrder}
                  onChange={(event) => change('minimumOrder', event.target.value)}
                />
              )}
            </Field>
            <Field
              label="Delivery time (minutes)"
              hint="Typical time to the door"
              error={errors.estimatedMinutes}
            >
              {(control) => (
                <Input
                  {...control}
                  name="estimatedMinutes"
                  inputMode="numeric"
                  value={draft.estimatedMinutes}
                  onChange={(event) => change('estimatedMinutes', event.target.value)}
                />
              )}
            </Field>
          </div>
        </fieldset>
      ) : null}
      <FormActions mode={mode} pending={isLoading} onBack={onBack} />
    </form>
  );
}
