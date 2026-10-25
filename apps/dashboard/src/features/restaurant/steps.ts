import type { OnboardingStatus, OnboardingStepId } from '@app/contracts';

export const WIZARD_STEPS = ['profile', 'branch', 'hours', 'fulfillment', 'review'] as const;
export type WizardStepId = (typeof WIZARD_STEPS)[number];

export const STEP_META: Record<OnboardingStepId, { label: string; description: string }> = {
  restaurant: {
    label: 'Your restaurant',
    description: 'Name your restaurant and choose the address customers will use to order.',
  },
  profile: {
    label: 'Profile',
    description: 'How your restaurant looks to customers, and how they can reach you.',
  },
  branch: {
    label: 'Location',
    description: 'Where customers pick up and where deliveries start from.',
  },
  hours: {
    label: 'Opening hours',
    description: 'When you accept orders. Add a second period for split shifts.',
  },
  fulfillment: {
    label: 'Delivery & pickup',
    description: 'How customers get their food, and what delivery costs.',
  },
  review: {
    label: 'Review',
    description: 'Check everything looks right, then open your restaurant for orders.',
  },
};

export function isWizardStep(value: string | undefined): value is WizardStepId {
  return (WIZARD_STEPS as readonly string[]).includes(value ?? '');
}

export function isStepComplete(
  status: Pick<OnboardingStatus, 'steps'>,
  step: OnboardingStepId,
): boolean {
  return status.steps.some((entry) => entry.id === step && entry.complete);
}

export function firstIncompleteStep(status: Pick<OnboardingStatus, 'steps'>): WizardStepId {
  return WIZARD_STEPS.find((step) => !isStepComplete(status, step)) ?? 'review';
}

export function resolveWizardStep(
  requested: string | undefined,
  status: Pick<OnboardingStatus, 'steps'>,
): WizardStepId {
  return isWizardStep(requested) ? requested : firstIncompleteStep(status);
}

export function adjacentStep(step: WizardStepId, offset: 1 | -1): WizardStepId | null {
  return WIZARD_STEPS[WIZARD_STEPS.indexOf(step) + offset] ?? null;
}

export function setupProgress(status: Pick<OnboardingStatus, 'steps'>): {
  complete: number;
  total: number;
} {
  return {
    complete: status.steps.filter((step) => step.complete).length,
    total: status.steps.length,
  };
}

export function stepHref(organizationId: string, step: OnboardingStepId): string {
  const target: WizardStepId = step === 'restaurant' ? 'profile' : step;
  return `/organizations/${encodeURIComponent(organizationId)}/onboarding?step=${target}`;
}
