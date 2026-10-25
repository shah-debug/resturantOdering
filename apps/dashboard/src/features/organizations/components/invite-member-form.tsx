'use client';

import { type FormEvent, useState } from 'react';
import { inviteMemberRequestSchema, type MembershipRole } from '@app/contracts';
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
  Select,
} from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { type FieldErrors, formValues, validateForm } from '@/lib/form';
import { useInviteMemberMutation } from '../organizations-api';
import { ROLE_LABELS } from '../roles';

const messages = {
  email: 'Enter a valid email address',
  fullName: 'Enter their full name (2–120 characters)',
  role: 'Choose a role',
};

export function InviteMemberForm({
  organizationId,
  roles,
}: {
  organizationId: string;
  roles: readonly MembershipRole[];
}) {
  const [inviteMember, { data, isLoading, error, reset }] = useInviteMemberMutation();
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const errors = { ...getFieldErrors(error), ...clientErrors };
  const defaultRole = roles.includes('ORDER_STAFF') ? 'ORDER_STAFF' : roles[0];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const form = event.currentTarget;
    const result = validateForm(inviteMemberRequestSchema, formValues(form), messages);
    if (!result.success) {
      setClientErrors(result.errors);
      return;
    }
    setClientErrors({});
    const response = await inviteMember({ organizationId, body: result.data });
    if (!('error' in response)) {
      form.reset();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite a team member</CardTitle>
        <CardDescription>They&apos;ll get an email with a link to join.</CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-4">
          {data ? <Alert variant="success">Invitation sent to {data.email}.</Alert> : null}
          <FormError error={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={errors.fullName}>
              {(control) => <Input {...control} name="fullName" autoComplete="off" />}
            </Field>
            <Field label="Email" error={errors.email}>
              {(control) => <Input {...control} name="email" type="email" autoComplete="off" />}
            </Field>
          </div>
          <Field label="Role" error={errors.role} className="sm:max-w-xs">
            {(control) => (
              <Select {...control} name="role" defaultValue={defaultRole}>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button
            type="submit"
            className="justify-self-start"
            pending={isLoading}
            pendingText="Sending invitation…"
          >
            Send invitation
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
