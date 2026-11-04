'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { ONBOARDING_STEPS, type OnboardingStepId } from '@app/contracts';
import { Progress } from '@app/web/ui';
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
  const completed = ONBOARDING_STEPS.filter((id) =>
    steps.some((step) => step.id === id && step.complete),
  ).length;
  const percent = Math.round((completed / ONBOARDING_STEPS.length) * 100);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          Step {ONBOARDING_STEPS.indexOf(current) + 1} of {ONBOARDING_STEPS.length}
        </span>
        <span className="text-muted-foreground tabular-nums">{percent}% complete</span>
      </div>
      <Progress value={percent} aria-label="Setup completed" />
      <ol
        aria-label="Setup progress"
        className="stagger grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6"
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
                  'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-300',
                  complete && 'animate-pop border-success bg-success text-white',
                  isCurrent &&
                    !complete &&
                    'border-primary bg-primary text-primary-foreground ring-4 ring-primary/15',
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
            'flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2 transition-all duration-200',
            isCurrent ? 'border-primary/50 bg-accent shadow-card' : 'bg-card',
          );
          return (
            <li key={id} aria-current={isCurrent ? 'step' : undefined}>
              {linkable ? (
                <Link
                  href={stepHref(organizationId, id)}
                  className={cn(
                    itemClasses,
                    'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
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
    </div>
  );
}
