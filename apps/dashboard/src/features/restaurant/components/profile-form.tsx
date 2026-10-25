'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { logoUrlSchema, type Organization, updateOrganizationRequestSchema } from '@app/contracts';
import { getFieldErrors } from '@app/web/api';
import { Field, Input, Select, Textarea } from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { RestaurantMark } from '@/components/shell/restaurant-mark';
import { type FieldErrors, validateForm } from '@/lib/form';
import { useUpdateOrganizationMutation } from '@/features/organizations/organizations-api';
import { FormActions, SavedNotice, type StepFormProps } from './form-parts';

export const DEFAULT_TIME_ZONE = 'Asia/Karachi';
const DESCRIPTION_MAX = 500;

const messages = {
  name: 'Enter a name between 2 and 120 characters',
  description: 'Write between 10 and 500 characters',
  timezone: 'Choose a valid time zone',
};

export function timeZoneOptions(current: string): string[] {
  const supported =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return Array.from(new Set([...supported, DEFAULT_TIME_ZONE, current].filter(Boolean))).sort();
}

export function ProfileForm({
  organization,
  mode,
  onSaved,
  onBack,
}: Omit<StepFormProps, 'organizationId'> & { organization: Organization }) {
  const [updateOrganization, { isLoading, isSuccess, error, reset }] =
    useUpdateOrganizationMutation();
  const [values, setValues] = useState({
    name: organization.name,
    logoUrl: organization.logoUrl ?? '',
    description: organization.description ?? '',
    contactPhone: organization.contactPhone ?? '',
    timezone: organization.timezone || DEFAULT_TIME_ZONE,
  });
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const errors = { ...getFieldErrors(error), ...clientErrors };
  const timeZoneItems = useMemo(
    () =>
      timeZoneOptions(organization.timezone).map((zone) => (
        <option key={zone} value={zone}>
          {zone.replace(/_/g, ' ')}
        </option>
      )),
    [organization.timezone],
  );
  const previewUrl = logoUrlSchema.safeParse(values.logoUrl.trim()).success
    ? values.logoUrl.trim()
    : null;

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const result = validateForm(
      updateOrganizationRequestSchema,
      {
        name: values.name,
        logoUrl: values.logoUrl.trim() || null,
        description: values.description.trim() || null,
        contactPhone: values.contactPhone.trim() || null,
        timezone: values.timezone,
      },
      messages,
    );
    if (!result.success) {
      setClientErrors(result.errors);
      return;
    }
    setClientErrors({});
    const response = await updateOrganization({
      organizationId: organization.id,
      body: result.data,
    });
    if (!('error' in response)) {
      onSaved?.();
    }
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-5">
      <SavedNotice show={mode === 'settings' && isSuccess}>Profile saved.</SavedNotice>
      <FormError error={error} />
      <Field label="Restaurant name" error={errors.name}>
        {(control) => (
          <Input
            {...control}
            name="name"
            autoComplete="organization"
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <Field
          label="Logo URL"
          hint="A square image works best. Must start with https://"
          error={errors.logoUrl}
        >
          {(control) => (
            <Input
              {...control}
              name="logoUrl"
              type="url"
              inputMode="url"
              placeholder="https://"
              autoCapitalize="none"
              spellCheck={false}
              value={values.logoUrl}
              onChange={(event) => update('logoUrl', event.target.value)}
            />
          )}
        </Field>
        <figure className="grid justify-items-center gap-1.5 sm:pt-6">
          <RestaurantMark
            name={values.name || organization.name}
            logoUrl={previewUrl}
            className="size-16 rounded-xl"
          />
          <figcaption className="text-xs text-muted-foreground">Logo preview</figcaption>
        </figure>
      </div>
      <Field
        label="Description"
        hint={`Tell customers what you serve. ${values.description.length}/${DESCRIPTION_MAX} characters.`}
        error={errors.description}
      >
        {(control) => (
          <Textarea
            {...control}
            name="description"
            rows={4}
            maxLength={DESCRIPTION_MAX}
            value={values.description}
            onChange={(event) => update('description', event.target.value)}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Contact phone"
          hint="International format, e.g. +923001234567"
          error={errors.contactPhone}
        >
          {(control) => (
            <Input
              {...control}
              name="contactPhone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={values.contactPhone}
              onChange={(event) => update('contactPhone', event.target.value)}
            />
          )}
        </Field>
        <Field label="Time zone" hint="Used for opening hours." error={errors.timezone}>
          {(control) => (
            <Select
              {...control}
              name="timezone"
              value={values.timezone}
              onChange={(event) => update('timezone', event.target.value)}
            >
              {timeZoneItems}
            </Select>
          )}
        </Field>
      </div>
      <FormActions mode={mode} pending={isLoading} onBack={onBack} />
    </form>
  );
}
