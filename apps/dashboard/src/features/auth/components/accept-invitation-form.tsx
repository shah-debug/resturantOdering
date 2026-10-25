'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import {
  type AcceptInvitationRequest,
  authTokenSchema,
  fullNameSchema,
  PASSWORD_MIN_LENGTH,
} from '@app/contracts';
import { getFieldErrors } from '@app/web/api';
import { Button, buttonVariants, Field, Input } from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { type FieldErrors, formValues } from '@/lib/form';
import { useAcceptInvitationMutation } from '../auth-api';
import { validateNewPassword } from '../password-validation';
import { AuthCard } from './auth-card';

function buildRequest(
  token: string,
  values: Record<string, string>,
): { request: AcceptInvitationRequest; errors: FieldErrors } {
  const fullName = values.fullName?.trim() ?? '';
  const password = values.password ?? '';
  const confirmation = values.confirmPassword ?? '';
  if (!fullName && !password && !confirmation) {
    return { request: { token }, errors: {} };
  }
  const errors = validateNewPassword(password, confirmation);
  if (!fullNameSchema.safeParse(fullName).success) {
    errors.fullName = 'Enter your full name (2–120 characters)';
  }
  return { request: { token, fullName, password }, errors };
}

export function AcceptInvitationForm({ token }: { token?: string | undefined }) {
  const [acceptInvitation, { data, isLoading, error, reset }] = useAcceptInvitationMutation();
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const errors = { ...getFieldErrors(error), ...clientErrors };

  if (!token || !authTokenSchema.safeParse(token).success) {
    return (
      <AuthCard
        title="Invitation link not valid"
        description="This invitation link is invalid or has expired. Ask the person who invited you to send a new one."
      >
        <Link href="/login" className={buttonVariants({ variant: 'outline' })}>
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  if (data) {
    return (
      <AuthCard title="Invitation accepted" description={data.message}>
        <Link href="/" className={buttonVariants()}>
          Continue to your dashboard
        </Link>
      </AuthCard>
    );
  }

  const validToken = token;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const { request, errors: validationErrors } = buildRequest(
      validToken,
      formValues(event.currentTarget),
    );
    if (Object.keys(validationErrors).length > 0) {
      setClientErrors(validationErrors);
      return;
    }
    setClientErrors({});
    await acceptInvitation(request);
  }

  return (
    <AuthCard
      title="Join your team"
      description="New to the dashboard? Enter your name and choose a password. If you already have an account, leave these empty and accept."
    >
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-4">
        <FormError error={error} />
        <Field label="Full name" error={errors.fullName}>
          {(control) => <Input {...control} name="fullName" autoComplete="name" />}
        </Field>
        <Field
          label="Password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={errors.password}
        >
          {(control) => (
            <Input {...control} name="password" type="password" autoComplete="new-password" />
          )}
        </Field>
        <Field label="Confirm password" error={errors.confirmPassword}>
          {(control) => (
            <Input
              {...control}
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
            />
          )}
        </Field>
        <Button type="submit" pending={isLoading} pendingText="Accepting…">
          Accept invitation
        </Button>
      </form>
    </AuthCard>
  );
}
