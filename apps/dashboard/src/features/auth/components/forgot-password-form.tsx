'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { emailRequestSchema } from '@app/contracts';
import { getFieldErrors } from '@app/web/api';
import { Alert, Button, Field, Input } from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { type FieldErrors, formValues, validateForm } from '@/lib/form';
import { useForgotPasswordMutation } from '../auth-api';
import { AuthCard, textLinkClasses } from './auth-card';

export function ForgotPasswordForm() {
  const [forgotPassword, { data, isLoading, error, reset }] = useForgotPasswordMutation();
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const errors = { ...getFieldErrors(error), ...clientErrors };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const result = validateForm(emailRequestSchema, formValues(event.currentTarget), {
      email: 'Enter a valid email address',
    });
    if (!result.success) {
      setClientErrors(result.errors);
      return;
    }
    setClientErrors({});
    await forgotPassword(result.data);
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you signed up with and we'll send you a reset link."
      footer={
        <p>
          <Link href="/login" className={textLinkClasses}>
            Back to sign in
          </Link>
        </p>
      }
    >
      {data ? (
        <Alert variant="success" title="Check your email">
          {data.message}
        </Alert>
      ) : (
        <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-4">
          <FormError error={error} />
          <Field label="Email" error={errors.email}>
            {(control) => <Input {...control} name="email" type="email" autoComplete="email" />}
          </Field>
          <Button type="submit" pending={isLoading} pendingText="Sending…">
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
