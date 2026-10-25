'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { authTokenSchema, PASSWORD_MIN_LENGTH } from '@app/contracts';
import { getFieldErrors, toApiError } from '@app/web/api';
import { Alert, Button, buttonVariants, Field, Input } from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { type FieldErrors, formValues } from '@/lib/form';
import { useResetPasswordMutation } from '../auth-api';
import { validateNewPassword } from '../password-validation';
import { AuthCard, textLinkClasses } from './auth-card';

const requestNewLink = (
  <Link href="/forgot-password" className={textLinkClasses}>
    Request a new reset link
  </Link>
);

export function ResetPasswordForm({ token }: { token?: string | undefined }) {
  const [resetPassword, { data, isLoading, error, reset }] = useResetPasswordMutation();
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const errors = { ...getFieldErrors(error), ...clientErrors };

  if (!token || !authTokenSchema.safeParse(token).success) {
    return (
      <AuthCard
        title="Reset link not valid"
        description="This password reset link is invalid or has expired."
        footer={<p>{requestNewLink}</p>}
      >
        <Link href="/login" className={buttonVariants({ variant: 'outline' })}>
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  if (data) {
    return (
      <AuthCard title="Password updated" description={data.message}>
        <Link href="/login" className={buttonVariants()}>
          Continue to sign in
        </Link>
      </AuthCard>
    );
  }

  const validToken = token;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const values = formValues(event.currentTarget);
    const password = values.password ?? '';
    const validationErrors = validateNewPassword(password, values.confirmPassword ?? '');
    if (Object.keys(validationErrors).length > 0) {
      setClientErrors(validationErrors);
      return;
    }
    setClientErrors({});
    await resetPassword({ token: validToken, password });
  }

  return (
    <AuthCard title="Choose a new password" footer={<p>{requestNewLink}</p>}>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-4">
        <FormError error={error} />
        {toApiError(error)?.code === 'INVALID_TOKEN' ? (
          <Alert>Reset links expire. You can request a new one below.</Alert>
        ) : null}
        <Field
          label="New password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={errors.password}
        >
          {(control) => (
            <Input {...control} name="password" type="password" autoComplete="new-password" />
          )}
        </Field>
        <Field label="Confirm new password" error={errors.confirmPassword}>
          {(control) => (
            <Input
              {...control}
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
            />
          )}
        </Field>
        <Button type="submit" pending={isLoading} pendingText="Saving…">
          Save new password
        </Button>
      </form>
    </AuthCard>
  );
}
