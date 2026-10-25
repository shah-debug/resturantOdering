'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { PASSWORD_MIN_LENGTH, signupRequestSchema } from '@app/contracts';
import { getFieldErrors } from '@app/web/api';
import { Alert, Button, Field, Input } from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { type FieldErrors, formValues, validateForm } from '@/lib/form';
import { useSignupMutation } from '../auth-api';
import { AuthCard, textLinkClasses } from './auth-card';
import { ResendVerificationForm } from './resend-verification-form';

const messages = {
  email: 'Enter a valid email address',
  fullName: 'Enter your full name (2–120 characters)',
};

const signInFooter = (
  <p>
    Already have an account?{' '}
    <Link href="/login" className={textLinkClasses}>
      Sign in
    </Link>
  </p>
);

export function SignupForm() {
  const [signup, { data, isLoading, error, reset }] = useSignupMutation();
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [submittedEmail, setSubmittedEmail] = useState('');
  const errors = { ...getFieldErrors(error), ...clientErrors };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const result = validateForm(signupRequestSchema, formValues(event.currentTarget), messages);
    if (!result.success) {
      setClientErrors(result.errors);
      return;
    }
    setClientErrors({});
    setSubmittedEmail(result.data.email);
    await signup(result.data);
  }

  if (data) {
    return (
      <AuthCard
        title="Check your email"
        description={
          <>
            We sent a verification link to <strong>{submittedEmail}</strong>. Open it to activate
            your account.
          </>
        }
        footer={signInFooter}
      >
        <Alert variant="success">{data.message}</Alert>
        <p className="text-sm text-muted-foreground">Didn&apos;t get the email?</p>
        <ResendVerificationForm defaultEmail={submittedEmail} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      description="Start managing your restaurant in minutes."
      footer={signInFooter}
    >
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-4">
        <FormError error={error} />
        <Field label="Full name" error={errors.fullName}>
          {(control) => <Input {...control} name="fullName" autoComplete="name" />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(control) => <Input {...control} name="email" type="email" autoComplete="email" />}
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
        <Button type="submit" pending={isLoading} pendingText="Creating account…">
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
