'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { authTokenSchema } from '@app/contracts';
import { getErrorMessage } from '@app/web/api';
import { Alert, buttonVariants } from '@app/web/ui';
import { useVerifyEmailMutation } from '../auth-api';
import { AuthCard, textLinkClasses } from './auth-card';
import { ResendVerificationForm } from './resend-verification-form';

const signInFooter = (
  <p>
    <Link href="/login" className={textLinkClasses}>
      Back to sign in
    </Link>
  </p>
);

export function VerifyEmail({ token }: { token?: string | undefined }) {
  const [verify, { data, error, isUninitialized, isLoading }] = useVerifyEmailMutation();
  const started = useRef(false);
  const tokenIsWellFormed = authTokenSchema.safeParse(token).success;

  useEffect(() => {
    if (!token || !tokenIsWellFormed || started.current) {
      return;
    }
    started.current = true;
    void verify({ token });
  }, [token, tokenIsWellFormed, verify]);

  if (data) {
    return (
      <AuthCard title="Email verified" description={data.message}>
        <Link href="/login" className={buttonVariants()}>
          Continue to sign in
        </Link>
      </AuthCard>
    );
  }

  if (tokenIsWellFormed && (isUninitialized || isLoading)) {
    return (
      <AuthCard title="Verifying your email">
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          Verifying your email…
        </p>
      </AuthCard>
    );
  }

  if (!token) {
    return (
      <AuthCard
        title="Verify your email"
        description="Enter your email address and we'll send you a new verification link."
        footer={signInFooter}
      >
        <ResendVerificationForm />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Verification link not valid"
      description="This link is invalid or has expired. Request a new one below."
      footer={signInFooter}
    >
      {error ? <Alert variant="destructive">{getErrorMessage(error)}</Alert> : null}
      <ResendVerificationForm />
    </AuthCard>
  );
}
