'use client';

import { type FormEvent, useState } from 'react';
import { emailRequestSchema } from '@app/contracts';
import { getFieldErrors } from '@app/web/api';
import { Alert, Button, Field, Input } from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { type FieldErrors, formValues, validateForm } from '@/lib/form';
import { useResendVerificationMutation } from '../auth-api';

export function ResendVerificationForm({ defaultEmail }: { defaultEmail?: string }) {
  const [resend, { data, isLoading, error, reset }] = useResendVerificationMutation();
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
    await resend(result.data);
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-4">
      {data ? <Alert variant="success">{data.message}</Alert> : null}
      <FormError error={error} />
      <Field label="Email" error={errors.email}>
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={defaultEmail}
          />
        )}
      </Field>
      <Button type="submit" variant="outline" pending={isLoading} pendingText="Sending…">
        Resend verification email
      </Button>
    </form>
  );
}
