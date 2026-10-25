'use client';

import { CircleAlert, CircleCheck, CircleDashed, type LucideIcon, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import type { ReadinessCheck } from '@app/contracts';
import { cn } from '@/lib/utils';
import { STEP_META, stepHref } from '../steps';

type ReadinessStatus = ReadinessCheck['status'];

const GROUPS: { status: ReadinessStatus; title: string; icon: LucideIcon; iconClass: string }[] = [
  {
    status: 'missing',
    title: 'Needs attention',
    icon: CircleAlert,
    iconClass: 'text-destructive',
  },
  {
    status: 'recommended',
    title: 'Recommended',
    icon: CircleDashed,
    iconClass: 'text-warning',
  },
  { status: 'complete', title: 'Done', icon: CircleCheck, iconClass: 'text-success' },
  { status: 'upcoming', title: 'Coming next', icon: Sparkles, iconClass: 'text-muted-foreground' },
];

export function ReadinessList({
  organizationId,
  checks,
  canEdit,
  hideComplete = false,
}: {
  organizationId: string;
  checks: readonly ReadinessCheck[];
  canEdit: boolean;
  hideComplete?: boolean;
}) {
  const idPrefix = useId();
  const groups = GROUPS.filter((group) => !(hideComplete && group.status === 'complete'))
    .map((group) => ({ ...group, checks: checks.filter((check) => check.status === group.status) }))
    .filter((group) => group.checks.length > 0);

  return (
    <div className="grid gap-5">
      {groups.map((group) => {
        const Icon = group.icon;
        const headingId = `${idPrefix}-${group.status}`;
        return (
          <section key={group.status} aria-labelledby={headingId} className="grid gap-2">
            <h3
              id={headingId}
              className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            >
              {group.title}
            </h3>
            <ul className="grid gap-2">
              {group.checks.map((check) => {
                const fixable =
                  canEdit &&
                  check.step !== null &&
                  check.step !== 'review' &&
                  (check.status === 'missing' || check.status === 'recommended');
                return (
                  <li
                    key={check.id}
                    className={cn(
                      'flex flex-wrap items-start gap-3 rounded-lg border px-3 py-2.5',
                      check.status === 'missing' && 'border-destructive/30 bg-destructive/5',
                      check.status === 'upcoming' && 'border-dashed',
                    )}
                  >
                    <Icon
                      className={cn('mt-0.5 size-4 shrink-0', group.iconClass)}
                      aria-hidden="true"
                    />
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <p className="text-sm font-medium">{check.label}</p>
                      {check.detail ? (
                        <p className="text-sm text-muted-foreground">{check.detail}</p>
                      ) : null}
                    </div>
                    {fixable && check.step ? (
                      <Link
                        href={stepHref(organizationId, check.step)}
                        className="rounded-sm text-sm font-medium underline underline-offset-4 hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        Go to{' '}
                        {STEP_META[check.step === 'restaurant' ? 'profile' : check.step].label}
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
