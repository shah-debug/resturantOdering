'use client';

import { PartyPopper } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Branch, OnboardingStatus, Organization } from '@app/contracts';
import { Alert, Button } from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { useCompleteOnboardingMutation } from '../restaurant-api';
import { ReadinessList } from './readiness-list';
import { StorefrontPreview } from './storefront-preview';

export function ReviewStep({
  organization,
  onboarding,
  branch,
  canEdit,
  onBack,
}: {
  organization: Organization;
  onboarding: OnboardingStatus;
  branch: Branch | null;
  canEdit: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const [completeOnboarding, { isLoading, error }] = useCompleteOnboardingMutation();
  const overviewHref = `/organizations/${encodeURIComponent(organization.id)}`;
  const missing = onboarding.checks.filter((check) => check.status === 'missing').length;

  async function handleComplete() {
    const response = await completeOnboarding(organization.id);
    if (!('error' in response)) {
      router.push(overviewHref);
    }
  }

  return (
    <div className="grid gap-6">
      {onboarding.completedAt ? (
        <Alert variant="success" title="Setup complete">
          <p>
            Your restaurant is set up. You can change any of these details later in Settings.{' '}
            <Link href={overviewHref} className="font-medium underline underline-offset-4">
              Go to overview
            </Link>
          </p>
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <section aria-labelledby="readiness-heading" className="grid content-start gap-3">
          <h3 id="readiness-heading" className="text-base font-semibold">
            Readiness
          </h3>
          <ReadinessList
            organizationId={organization.id}
            checks={onboarding.checks}
            canEdit={canEdit}
          />
        </section>
        <section aria-labelledby="preview-heading" className="grid content-start gap-3">
          <h3 id="preview-heading" className="text-base font-semibold">
            What customers will see
          </h3>
          <StorefrontPreview organization={organization} branch={branch} />
        </section>
      </div>
      <FormError error={error} />
      {!onboarding.completedAt ? (
        <div className="grid gap-3 border-t pt-4">
          {!onboarding.canComplete ? (
            <p className="text-sm text-muted-foreground" id="complete-hint">
              {missing > 0
                ? `Finish ${missing === 1 ? 'the item' : `the ${missing} items`} under “Needs attention” to complete setup.`
                : 'Some required details are still missing.'}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={onBack} disabled={isLoading}>
              Back
            </Button>
            <Button
              disabled={!onboarding.canComplete || !canEdit}
              aria-describedby={!onboarding.canComplete ? 'complete-hint' : undefined}
              pending={isLoading}
              pendingText="Completing…"
              onClick={() => void handleComplete()}
            >
              <PartyPopper aria-hidden="true" />
              Complete setup
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
