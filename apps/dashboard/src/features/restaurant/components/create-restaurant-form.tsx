'use client';

import { skipToken } from '@reduxjs/toolkit/query';
import { CircleCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import {
  createOrganizationRequestSchema,
  organizationSlugSchema,
  type SlugAvailability,
} from '@app/contracts';
import { getErrorMessage, getFieldErrors } from '@app/web/api';
import { Button, Field, Input } from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { useCreateOrganizationMutation } from '@/features/organizations/organizations-api';
import { suggestSlug } from '@/features/organizations/roles';
import { hasHttpStatus } from '@/lib/api';
import { type FieldErrors, validateForm } from '@/lib/form';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useCheckSlugAvailabilityQuery } from '../restaurant-api';
import { stepHref } from '../steps';

export const SLUG_CHECK_DELAY_MS = 400;

const messages = { name: 'Enter a name between 2 and 120 characters' };

const UNAVAILABLE_MESSAGES: Record<NonNullable<SlugAvailability['reason']>, string> = {
  taken: 'This address is already taken. Try another one.',
  reserved: 'This address is reserved. Try another one.',
  invalid: 'This address is not allowed. Try another one.',
};

export function slugAvailabilityMessage(availability: SlugAvailability): string | null {
  if (availability.available) {
    return null;
  }
  return UNAVAILABLE_MESSAGES[availability.reason ?? 'taken'];
}

export function CreateRestaurantForm() {
  const router = useRouter();
  const [createOrganization, { isLoading, error, reset }] = useCreateOrganizationMutation();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});

  const normalizedSlug = slug.trim().toLowerCase();
  const slugCheck = organizationSlugSchema.safeParse(normalizedSlug);
  const slugFormatError =
    normalizedSlug && !slugCheck.success ? slugCheck.error.issues[0]?.message : undefined;
  const debouncedSlug = useDebouncedValue(normalizedSlug, SLUG_CHECK_DELAY_MS);
  const settled = debouncedSlug === normalizedSlug;
  const availability = useCheckSlugAvailabilityQuery(
    settled && slugCheck.success && normalizedSlug ? normalizedSlug : skipToken,
  );
  const availabilityForSlug =
    availability.data && availability.data.slug === normalizedSlug ? availability.data : undefined;
  const unavailableMessage = availabilityForSlug
    ? slugAvailabilityMessage(availabilityForSlug)
    : null;

  const serverErrors = getFieldErrors(error);
  if (hasHttpStatus(error, 409) && !serverErrors.slug) {
    serverErrors.slug = getErrorMessage(error);
  }
  const errors: FieldErrors = { ...serverErrors, ...clientErrors };
  const slugError = errors.slug ?? slugFormatError ?? unavailableMessage ?? undefined;

  let slugStatus: string | undefined;
  if (!slugError && normalizedSlug && slugCheck.success) {
    if (!settled || availability.isFetching) {
      slugStatus = 'Checking availability…';
    } else if (availabilityForSlug?.available) {
      slugStatus = `${normalizedSlug} is available`;
    } else if (availability.isError) {
      slugStatus = "We couldn't check availability right now. We'll check again when you continue.";
    }
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(suggestSlug(value));
    }
    setClientErrors(({ name: _name, ...rest }) => rest);
  }

  function handleSlugChange(value: string) {
    setSlugEdited(true);
    setSlug(value);
    setClientErrors(({ slug: _slug, ...rest }) => rest);
    if (error) {
      reset();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const result = validateForm(createOrganizationRequestSchema, { name, slug }, messages);
    if (!result.success) {
      setClientErrors(result.errors);
      return;
    }
    if (unavailableMessage) {
      setClientErrors({ slug: unavailableMessage });
      return;
    }
    setClientErrors({});
    const response = await createOrganization(result.data);
    if ('data' in response && response.data) {
      router.push(stepHref(response.data.id, 'profile'));
    }
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-5">
      <FormError error={hasHttpStatus(error, 409) ? undefined : error} />
      <Field label="Restaurant name" error={errors.name}>
        {(control) => (
          <Input
            {...control}
            name="name"
            autoComplete="organization"
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
          />
        )}
      </Field>
      <Field
        label="Web address"
        hint="Lowercase letters, numbers and hyphens. Customers will use it to find your ordering page."
        error={slugError}
      >
        {(control) => (
          <Input
            {...control}
            name="slug"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            value={slug}
            onChange={(event) => handleSlugChange(event.target.value)}
          />
        )}
      </Field>
      <p
        role="status"
        aria-live="polite"
        className="-mt-3 flex min-h-5 items-center gap-1.5 text-sm text-muted-foreground"
      >
        {slugStatus && availabilityForSlug?.available && settled && !availability.isFetching ? (
          <CircleCheck className="size-4 text-success" aria-hidden="true" />
        ) : null}
        {slugStatus}
      </p>
      <div className="flex justify-end border-t pt-4">
        <Button type="submit" pending={isLoading} pendingText="Creating…">
          Save and continue
        </Button>
      </div>
    </form>
  );
}
