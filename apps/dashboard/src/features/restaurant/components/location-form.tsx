'use client';

import { type FormEvent, useState } from 'react';
import { type Branch, createBranchRequestSchema, type Organization } from '@app/contracts';
import { getFieldErrors } from '@app/web/api';
import { Field, Input } from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { type FieldErrors, validateForm } from '@/lib/form';
import { useCreateBranchMutation, useUpdateBranchMutation } from '../restaurant-api';
import { FormActions, SavedNotice, type StepFormProps } from './form-parts';

const messages = {
  name: 'Enter a location name (2–120 characters)',
  addressLine: 'Enter the street address (at least 5 characters)',
  area: 'Enter an area of at least 2 characters, or leave it blank',
  city: 'Enter the city (2–80 characters)',
};

export function LocationForm({
  organization,
  branch,
  mode,
  onSaved,
  onBack,
}: Omit<StepFormProps, 'organizationId'> & {
  organization: Organization;
  branch: Branch | null;
}) {
  const [createBranch, creation] = useCreateBranchMutation();
  const [updateBranch, update] = useUpdateBranchMutation();
  const mutation = branch ? update : creation;
  const [values, setValues] = useState({
    name: branch?.name ?? organization.name,
    phone: branch?.phone ?? organization.contactPhone ?? '',
    addressLine: branch?.addressLine ?? '',
    area: branch?.area ?? '',
    city: branch?.city ?? '',
  });
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const errors = { ...getFieldErrors(mutation.error), ...clientErrors };

  function change(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    creation.reset();
    update.reset();
    const result = validateForm(
      createBranchRequestSchema,
      { ...values, area: values.area.trim() || null },
      messages,
    );
    if (!result.success) {
      setClientErrors(result.errors);
      return;
    }
    setClientErrors({});
    const response = branch
      ? await updateBranch({
          organizationId: organization.id,
          branchId: branch.id,
          body: result.data,
        })
      : await createBranch({ organizationId: organization.id, body: result.data });
    if (!('error' in response)) {
      onSaved?.();
    }
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-5">
      <SavedNotice show={mode === 'settings' && mutation.isSuccess}>Location saved.</SavedNotice>
      <FormError error={mutation.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location name" hint="e.g. Clifton branch" error={errors.name}>
          {(control) => (
            <Input
              {...control}
              name="name"
              value={values.name}
              onChange={(event) => change('name', event.target.value)}
            />
          )}
        </Field>
        <Field
          label="Branch phone"
          hint="International format, e.g. +923001234567"
          error={errors.phone}
        >
          {(control) => (
            <Input
              {...control}
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={values.phone}
              onChange={(event) => change('phone', event.target.value)}
            />
          )}
        </Field>
      </div>
      <Field label="Address line" error={errors.addressLine}>
        {(control) => (
          <Input
            {...control}
            name="addressLine"
            autoComplete="address-line1"
            value={values.addressLine}
            onChange={(event) => change('addressLine', event.target.value)}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Area (optional)" hint="Neighbourhood or block" error={errors.area}>
          {(control) => (
            <Input
              {...control}
              name="area"
              autoComplete="address-level3"
              value={values.area}
              onChange={(event) => change('area', event.target.value)}
            />
          )}
        </Field>
        <Field label="City" error={errors.city}>
          {(control) => (
            <Input
              {...control}
              name="city"
              autoComplete="address-level2"
              value={values.city}
              onChange={(event) => change('city', event.target.value)}
            />
          )}
        </Field>
      </div>
      <FormActions mode={mode} pending={mutation.isLoading} onBack={onBack} />
    </form>
  );
}
