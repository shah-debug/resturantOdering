'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { createOrganizationRequestSchema } from '@app/contracts';
import { getFieldErrors } from '@app/web/api';
import {
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
import { type FieldErrors, validateForm } from '@/lib/form';
import { useCreateOrganizationMutation } from '../organizations-api';
import { suggestSlug } from '../roles';

const messages = { name: 'Enter a name between 2 and 120 characters' };

export function CreateOrganizationForm() {
  const router = useRouter();
  const [createOrganization, { isLoading, error, reset }] = useCreateOrganizationMutation();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const errors = { ...getFieldErrors(error), ...clientErrors };

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(suggestSlug(value));
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
    setClientErrors({});
    const response = await createOrganization(result.data);
    if ('data' in response && response.data) {
      router.push(`/organizations/${response.data.id}/members`);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an organization</CardTitle>
        <CardDescription>
          An organization holds your restaurant, its branches and team.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-4">
          <FormError error={error} />
          <Field label="Organization name" error={errors.name}>
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
            label="Address"
            hint="Lowercase letters, numbers and hyphens. Used in your ordering link."
            error={errors.slug}
          >
            {(control) => (
              <Input
                {...control}
                name="slug"
                autoCapitalize="none"
                spellCheck={false}
                value={slug}
                onChange={(event) => {
                  setSlugEdited(true);
                  setSlug(event.target.value);
                }}
              />
            )}
          </Field>
          <Button
            type="submit"
            className="justify-self-start"
            pending={isLoading}
            pendingText="Creating…"
          >
            Create organization
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
