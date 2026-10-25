'use client';

import { type FormEvent, useState } from 'react';
import { PASSWORD_MIN_LENGTH } from '@app/contracts';
import { getFieldErrors } from '@app/web/api';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { type FieldErrors, formValues } from '@/lib/form';
import { useChangePasswordMutation } from '../auth-api';
import { validateNewPassword } from '../password-validation';

export function ChangePasswordForm() {
  const [changePassword, { data, isLoading, error, reset }] = useChangePasswordMutation();
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const apiErrors = getFieldErrors(error);
  const errors: FieldErrors = {
    ...apiErrors,
    ...(apiErrors.newPassword ? { password: apiErrors.newPassword } : {}),
    ...clientErrors,
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const form = event.currentTarget;
    const values = formValues(form);
    const currentPassword = values.currentPassword ?? '';
    const newPassword = values.password ?? '';
    const validationErrors = validateNewPassword(newPassword, values.confirmPassword ?? '');
    if (!currentPassword) {
      validationErrors.currentPassword = 'Enter your current password';
    }
    if (Object.keys(validationErrors).length > 0) {
      setClientErrors(validationErrors);
      return;
    }
    setClientErrors({});
    const response = await changePassword({ currentPassword, newPassword });
    if (!('error' in response)) {
      form.reset();
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>Use a long password you don&apos;t use anywhere else.</CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-4">
          {data ? <Alert variant="success">{data.message}</Alert> : null}
          <FormError error={error} />
          <Field label="Current password" error={errors.currentPassword}>
            {(control) => (
              <Input
                {...control}
                name="currentPassword"
                type="password"
                autoComplete="current-password"
              />
            )}
          </Field>
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
          <Button
            type="submit"
            className="justify-self-start"
            pending={isLoading}
            pendingText="Updating…"
          >
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
