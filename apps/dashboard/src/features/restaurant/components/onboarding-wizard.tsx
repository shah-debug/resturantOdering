'use client';

import { MapPin } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button, Card, CardContent, CardDescription, CardHeader } from '@app/web/ui';
import {
  EmptyState,
  ErrorState,
  isUnavailableError,
  LoadingState,
  UnavailableState,
} from '@/components/states';
import { useMeQuery } from '@/features/auth/auth-api';
import { canManageRestaurant, ROLE_LABELS } from '@/features/organizations/roles';
import { adjacentStep, resolveWizardStep, STEP_META, stepHref, type WizardStepId } from '../steps';
import { useRestaurantData } from '../use-restaurant-data';
import { FulfillmentForm } from './fulfillment-form';
import { LocationForm } from './location-form';
import { OpeningHoursForm } from './opening-hours-form';
import { ProfileForm } from './profile-form';
import { ReadOnlyNotice } from './form-parts';
import { ReviewStep } from './review-step';
import { SetupProgress } from './setup-progress';

export function OnboardingWizard({
  organizationId,
  step,
}: {
  organizationId: string;
  step?: string | undefined;
}) {
  const router = useRouter();
  const { data: me } = useMeQuery();
  const role = me?.memberships.find((entry) => entry.organizationId === organizationId)?.role;
  const canEdit = canManageRestaurant(role);
  const { organization, onboarding, branch, isLoading, error, retry, retrying } =
    useRestaurantData(organizationId);

  if (isLoading) {
    return <LoadingState label="Loading setup…" />;
  }
  if (isUnavailableError(error)) {
    return <UnavailableState error={error} />;
  }
  if (!organization || !onboarding || error) {
    return (
      <ErrorState
        title="We couldn't load your setup"
        error={error}
        onRetry={retry}
        retrying={retrying}
      />
    );
  }

  const current = resolveWizardStep(step, onboarding);
  const go = (target: WizardStepId | null) => {
    if (target) {
      router.push(stepHref(organizationId, target));
    }
  };
  const next = () => go(adjacentStep(current, 1));
  const previous = adjacentStep(current, -1);
  const back = previous ? () => go(previous) : undefined;

  let body: ReactNode;
  if (current === 'review') {
    body = (
      <ReviewStep
        organization={organization}
        onboarding={onboarding}
        branch={branch}
        canEdit={canEdit}
        onBack={() => go(previous)}
      />
    );
  } else if (!canEdit) {
    body = (
      <div className="grid gap-4">
        <ReadOnlyNotice roleLabel={role ? ROLE_LABELS[role] : undefined} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {back ? (
            <Button variant="outline" onClick={back}>
              Back
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
          <Button variant="outline" onClick={next}>
            Next
          </Button>
        </div>
      </div>
    );
  } else if (current === 'profile') {
    body = (
      <ProfileForm
        key={organization.id}
        organization={organization}
        mode="onboarding"
        onSaved={next}
        onBack={back}
      />
    );
  } else if (current === 'branch') {
    body = (
      <LocationForm
        key={branch?.id ?? 'new'}
        organization={organization}
        branch={branch}
        mode="onboarding"
        onSaved={next}
        onBack={back}
      />
    );
  } else if (!branch) {
    body = (
      <EmptyState
        icon={MapPin}
        title="Add your location first"
        description="Opening hours, delivery and pickup belong to a location."
        action={
          <Button asChild>
            <Link href={stepHref(organizationId, 'branch')}>Go to Location</Link>
          </Button>
        }
      />
    );
  } else if (current === 'hours') {
    body = (
      <OpeningHoursForm
        key={branch.id}
        organizationId={organizationId}
        branch={branch}
        mode="onboarding"
        onSaved={next}
        onBack={back}
      />
    );
  } else {
    body = (
      <FulfillmentForm
        key={branch.id}
        organizationId={organizationId}
        branch={branch}
        mode="onboarding"
        onSaved={next}
        onBack={back}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="text-sm font-medium text-muted-foreground">Restaurant setup</p>
        <h1 className="text-2xl font-semibold tracking-tight">Set up {organization.name}</h1>
        <p className="text-sm text-muted-foreground">
          Each step is saved as you go, so you can leave and pick up where you left off.
        </p>
      </header>
      <SetupProgress steps={onboarding.steps} current={current} organizationId={organizationId} />
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold tracking-tight">{STEP_META[current].label}</h2>
          <CardDescription>{STEP_META[current].description}</CardDescription>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </div>
  );
}
