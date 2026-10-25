import { ONBOARDING_STEPS, type OnboardingStepId } from '@app/contracts';
import { adjacentStep, firstIncompleteStep, resolveWizardStep, stepHref } from './steps';

function status(complete: OnboardingStepId[]) {
  return { steps: ONBOARDING_STEPS.map((id) => ({ id, complete: complete.includes(id) })) };
}

describe('onboarding steps', () => {
  it('resumes at the first incomplete step', () => {
    expect(firstIncompleteStep(status(['restaurant']))).toBe('profile');
    expect(firstIncompleteStep(status(['restaurant', 'profile']))).toBe('branch');
    expect(firstIncompleteStep(status(['restaurant', 'profile', 'hours']))).toBe('branch');
    expect(
      firstIncompleteStep(status(['restaurant', 'profile', 'branch', 'hours', 'fulfillment'])),
    ).toBe('review');
    expect(firstIncompleteStep(status([...ONBOARDING_STEPS]))).toBe('review');
  });

  it('honours a valid requested step and ignores unknown ones', () => {
    const current = status(['restaurant']);
    expect(resolveWizardStep('hours', current)).toBe('hours');
    expect(resolveWizardStep(undefined, current)).toBe('profile');
    expect(resolveWizardStep('restaurant', current)).toBe('profile');
    expect(resolveWizardStep('menu', current)).toBe('profile');
  });

  it('moves between wizard steps', () => {
    expect(adjacentStep('profile', 1)).toBe('branch');
    expect(adjacentStep('profile', -1)).toBeNull();
    expect(adjacentStep('review', 1)).toBeNull();
    expect(adjacentStep('review', -1)).toBe('fulfillment');
  });

  it('links the restaurant step to the profile form', () => {
    expect(stepHref('abc', 'restaurant')).toBe('/organizations/abc/onboarding?step=profile');
    expect(stepHref('abc', 'hours')).toBe('/organizations/abc/onboarding?step=hours');
  });
});
