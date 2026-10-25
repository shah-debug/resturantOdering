'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { ONBOARDING_STEPS, type OnboardingStepId } from '@app/contracts';
import { cn } from '@/lib/utils';
import { STEP_META, stepHref } from '../steps';

export function SetupProgress({
  steps,
  current,
  organizationId,
}: {
  steps: readonly { id: OnboardingStepId; complete: boolean }[];
  current: OnboardingStepId;
  organizationId?: string;
}) {
  return (
    <ol
      aria-label="Setup progress"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
    >
      {ONBOARDING_STEPS.map((id, index) => {
        const complete = steps.some((step) => step.id === id && step.complete);
        const isCurrent = id === current;
        const state = isCurrent ? 'Current step' : complete ? 'Saved' : 'Not started';
        const body = (
          <>
            <span
              aria-hidden="true"
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                complete && 'border-success bg-success text-white',
                isCurrent && !complete && 'border-primary bg-primary text-primary-foreground',
              )}
            >
              {complete ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span className="grid min-w-0">
              <span className="truncate text-sm font-medium">{STEP_META[id].label}</span>
              <span className="text-xs text-muted-foreground">{state}</span>
            </span>
          </>
        );
        const linkable = organizationId && id !== 'restaurant' && !isCurrent;
        const itemClasses = cn(
          'flex min-h-12 items-center gap-2 rounded-lg border px-2.5 py-2',
          isCurrent ? 'border-primary bg-accent' : 'bg-card',
        );
        return (
          <li key={id} aria-current={isCurrent ? 'step' : undefined}>
            {linkable ? (
              <Link
                href={stepHref(organizationId, id)}
                className={cn(
                  itemClasses,
                  'transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                )}
              >
                {body}
              </Link>
            ) : (
              <div className={itemClasses}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
