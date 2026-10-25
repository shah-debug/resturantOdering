'use client';

import { MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader } from '@app/web/ui';
import {
  EmptyState,
  ErrorState,
  isUnavailableError,
  LoadingState,
  UnavailableState,
} from '@/components/states';
import { useMeQuery } from '@/features/auth/auth-api';
import { canManageRestaurant, ROLE_LABELS } from '@/features/organizations/roles';
import { STEP_META } from '../steps';
import { useRestaurantData } from '../use-restaurant-data';
import { ReadOnlyNotice } from './form-parts';
import { FulfillmentForm } from './fulfillment-form';
import { LocationForm } from './location-form';
import { OpeningHoursForm } from './opening-hours-form';
import { ProfileForm } from './profile-form';

const SECTIONS = [
  { id: 'profile', step: 'profile' },
  { id: 'location', step: 'branch' },
  { id: 'hours', step: 'hours' },
  { id: 'fulfillment', step: 'fulfillment' },
] as const;

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SettingsPage({ organizationId }: { organizationId: string }) {
  const { data: me } = useMeQuery();
  const role = me?.memberships.find((entry) => entry.organizationId === organizationId)?.role;
  const canEdit = canManageRestaurant(role);
  const { organization, onboarding, branch, isLoading, error, retry, retrying } =
    useRestaurantData(organizationId);

  if (isLoading) {
    return <LoadingState label="Loading settings…" rows={4} />;
  }
  if (isUnavailableError(error)) {
    return <UnavailableState error={error} />;
  }
  if (!organization || !onboarding || error) {
    return (
      <ErrorState
        title="We couldn't load your settings"
        error={error}
        onRetry={retry}
        retrying={retrying}
      />
    );
  }

  const needsBranch = (
    <EmptyState
      icon={MapPin}
      title="Add your location first"
      description="Save your location above, then set hours, delivery and pickup."
      className="py-6"
    />
  );

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Update your restaurant details at any time. Changes apply straight away.
        </p>
      </header>
      {!canEdit ? (
        <ReadOnlyNotice roleLabel={role ? ROLE_LABELS[role] : undefined} />
      ) : (
        <>
          <nav aria-label="Settings sections" className="-mt-2">
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {STEP_META[section.step].label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <SettingsSection
            id="profile"
            title={STEP_META.profile.label}
            description={STEP_META.profile.description}
          >
            <ProfileForm key={organization.id} organization={organization} mode="settings" />
          </SettingsSection>
          <SettingsSection
            id="location"
            title={STEP_META.branch.label}
            description={STEP_META.branch.description}
          >
            <LocationForm
              key={branch?.id ?? 'new'}
              organization={organization}
              branch={branch}
              mode="settings"
            />
          </SettingsSection>
          <SettingsSection
            id="hours"
            title={STEP_META.hours.label}
            description={STEP_META.hours.description}
          >
            {branch ? (
              <OpeningHoursForm
                key={branch.id}
                organizationId={organizationId}
                branch={branch}
                mode="settings"
              />
            ) : (
              needsBranch
            )}
          </SettingsSection>
          <SettingsSection
            id="fulfillment"
            title={STEP_META.fulfillment.label}
            description={STEP_META.fulfillment.description}
          >
            {branch ? (
              <FulfillmentForm
                key={branch.id}
                organizationId={organizationId}
                branch={branch}
                mode="settings"
              />
            ) : (
              needsBranch
            )}
          </SettingsSection>
        </>
      )}
    </div>
  );
}
