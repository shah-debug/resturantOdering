'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { loginRequestSchema } from '@app/contracts';
import { getFieldErrors, toApiError } from '@app/web/api';
import { Button, Field, Input } from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { type FieldErrors, formValues, safeNextPath, validateForm } from '@/lib/form';
import { useLoginMutation } from '../auth-api';
import { AuthCard, textLinkClasses } from './auth-card';

const messages = { email: 'Enter a valid email address', password: 'Enter your password' };

export function LoginForm({ next }: { next?: string | undefined }) {
  const router = useRouter();
  const [login, { isLoading, error, reset }] = useLoginMutation();
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const errors = { ...getFieldErrors(error), ...clientErrors };
  const errorCode = toApiError(error)?.code;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const result = validateForm(loginRequestSchema, formValues(event.currentTarget), messages);
    if (!result.success) {
      setClientErrors(result.errors);
      return;
    }
    setClientErrors({});
    const response = await login(result.data);
    if (!('error' in response)) {
      router.replace(safeNextPath(next));
    }
  }

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Sign in to manage your restaurant."
      footer={
        <p>
          New here?{' '}
          <Link href="/signup" className={textLinkClasses}>
            Create an account
          </Link>
        </p>
      }
    >
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-4">
        <FormError error={error}>
          {errorCode === 'EMAIL_NOT_VERIFIED' ? (
            <p>
              <Link href="/verify-email" className={textLinkClasses}>
                Resend the verification email
              </Link>
            </p>
          ) : null}
        </FormError>
        <Field label="Email" error={errors.email}>
          {(control) => <Input {...control} name="email" type="email" autoComplete="email" />}
        </Field>
        <Field label="Password" error={errors.password}>
          {(control) => (
            <Input {...control} name="password" type="password" autoComplete="current-password" />
          )}
        </Field>
        <div className="flex justify-end text-sm">
          <Link href="/forgot-password" className={textLinkClasses}>
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" pending={isLoading} pendingText="Signing in…">
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
