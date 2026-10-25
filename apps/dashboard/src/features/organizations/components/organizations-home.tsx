'use client';

import Link from 'next/link';
import { getErrorMessage } from '@app/web/api';
import { Alert, Button, Card, CardDescription, CardHeader, CardTitle } from '@app/web/ui';
import { useMeQuery } from '@/features/auth/auth-api';
import { useListOrganizationsQuery } from '../organizations-api';
import { ROLE_LABELS } from '../roles';
import { CreateOrganizationForm } from './create-organization-form';

function OrganizationList() {
  const { data: me } = useMeQuery();
  const { data, error, isLoading, isFetching, refetch } = useListOrganizationsQuery();

  if (isLoading) {
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Loading organizations…
      </p>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <div className="flex flex-wrap items-center gap-3">
          <span>{getErrorMessage(error)}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            pending={isFetching}
            pendingText="Retrying…"
          >
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>No organizations yet</CardTitle>
          <CardDescription>
            Create your first organization below, or ask a teammate to invite you to theirs.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {data.map((organization) => {
        const role = me?.memberships.find(
          (membership) => membership.organizationId === organization.id,
        )?.role;
        return (
          <li key={organization.id}>
            <Link
              href={`/organizations/${organization.id}/members`}
              className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Card className="h-full transition-colors hover:bg-accent/50">
                <CardHeader>
                  <CardTitle className="text-base">{organization.name}</CardTitle>
                  <CardDescription>
                    {organization.slug}
                    {role ? ` · ${ROLE_LABELS[role]}` : ''}
                    {organization.status !== 'ACTIVE'
                      ? ` · ${organization.status.toLowerCase()}`
                      : ''}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function OrganizationsHome() {
  return (
    <div className="grid gap-8">
      <section aria-labelledby="organizations-heading" className="grid gap-4">
        <h1 id="organizations-heading" className="text-2xl font-semibold tracking-tight">
          Your organizations
        </h1>
        <OrganizationList />
      </section>
      <section aria-label="Create an organization" className="max-w-lg">
        <CreateOrganizationForm />
      </section>
    </div>
  );
}
