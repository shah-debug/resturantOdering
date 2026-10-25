'use client';

import { Copy, Moon, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  type Branch,
  DAYS_OF_WEEK,
  findOpeningHoursOverlap,
  type OpeningInterval,
  timeOfDaySchema,
} from '@app/contracts';
import { Alert, Badge, Button, Input, Switch } from '@app/web/ui';
import { FormError } from '@/components/form-error';
import { cn } from '@/lib/utils';
import { dayLabel, intervalsForDay, isOvernight } from '../hours';
import { useUpdateOpeningHoursMutation } from '../restaurant-api';
import { FormActions, SavedNotice, type StepFormProps } from './form-parts';

interface DraftInterval {
  key: number;
  opensAt: string;
  closesAt: string;
}

export type DraftWeek = Record<number, DraftInterval[]>;

const DEFAULT_OPENS = '09:00';
const DEFAULT_CLOSES = '22:00';
let draftKey = 0;

function draft(opensAt: string, closesAt: string): DraftInterval {
  draftKey += 1;
  return { key: draftKey, opensAt, closesAt };
}

export function toDraftWeek(intervals: readonly OpeningInterval[]): DraftWeek {
  const week: DraftWeek = {};
  for (const day of DAYS_OF_WEEK) {
    week[day.value] = intervalsForDay(intervals, day.value).map((interval) =>
      draft(interval.opensAt, interval.closesAt),
    );
  }
  return week;
}

export function validateWeek(week: DraftWeek): {
  intervals: OpeningInterval[];
  errors: Record<number, string>;
} {
  const errors: Record<number, string> = {};
  const intervals: OpeningInterval[] = [];
  for (const day of DAYS_OF_WEEK) {
    for (const interval of week[day.value] ?? []) {
      if (
        !timeOfDaySchema.safeParse(interval.opensAt).success ||
        !timeOfDaySchema.safeParse(interval.closesAt).success
      ) {
        errors[day.value] ??= 'Enter an opening and a closing time';
      } else if (interval.opensAt === interval.closesAt) {
        errors[day.value] ??= 'Opening and closing times must differ';
      }
      intervals.push({
        dayOfWeek: day.value,
        opensAt: interval.opensAt,
        closesAt: interval.closesAt,
      });
    }
  }
  if (Object.keys(errors).length === 0) {
    const overlap = findOpeningHoursOverlap(intervals);
    if (overlap) {
      const first = intervals[overlap[0]];
      const second = intervals[overlap[1]];
      if (first && second) {
        errors[second.dayOfWeek] =
          first.dayOfWeek === second.dayOfWeek
            ? 'These hours overlap. Adjust or remove one of the periods.'
            : `These hours overlap with ${dayLabel(first.dayOfWeek)}'s late-night hours.`;
      }
    }
  }
  return { intervals, errors };
}

export function OpeningHoursForm({
  organizationId,
  branch,
  mode,
  onSaved,
  onBack,
}: StepFormProps & { branch: Branch }) {
  const [updateOpeningHours, { isLoading, isSuccess, error, reset }] =
    useUpdateOpeningHoursMutation();
  const [week, setWeek] = useState<DraftWeek>(() => toDraftWeek(branch.openingHours));
  const [errors, setErrors] = useState<Record<number, string>>({});

  function setDay(day: number, intervals: DraftInterval[]) {
    setWeek((current) => ({ ...current, [day]: intervals }));
    setErrors((current) => {
      const next = { ...current };
      delete next[day];
      return next;
    });
  }

  function copyToAll(day: number) {
    const source = week[day] ?? [];
    const next: DraftWeek = {};
    for (const entry of DAYS_OF_WEEK) {
      next[entry.value] = source.map((interval) => draft(interval.opensAt, interval.closesAt));
    }
    setWeek(next);
    setErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reset();
    const result = validateWeek(week);
    setErrors(result.errors);
    if (Object.keys(result.errors).length > 0) {
      return;
    }
    const response = await updateOpeningHours({
      organizationId,
      branchId: branch.id,
      body: { intervals: result.intervals },
    });
    if (!('error' in response)) {
      onSaved?.();
    }
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="grid gap-5">
      <SavedNotice show={mode === 'settings' && isSuccess}>Opening hours saved.</SavedNotice>
      <FormError error={error} />
      {hasErrors ? (
        <Alert variant="destructive" title="Check your opening hours">
          Fix the highlighted days before saving.
        </Alert>
      ) : null}
      <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
        <Moon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Open past midnight? Set a closing time earlier than the opening time, e.g. 18:00 to 02:00.
      </p>
      <ul className="divide-y rounded-lg border" aria-label="Weekly opening hours">
        {DAYS_OF_WEEK.map((day) => {
          const intervals = week[day.value] ?? [];
          const open = intervals.length > 0;
          const errorId = `hours-error-${day.value}`;
          const dayError = errors[day.value];
          return (
            <li
              key={day.value}
              className={cn(
                'grid gap-3 p-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:p-4',
                dayError && 'bg-destructive/5',
              )}
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={open}
                  aria-label={`Open on ${day.label}`}
                  onCheckedChange={(checked) =>
                    setDay(day.value, checked ? [draft(DEFAULT_OPENS, DEFAULT_CLOSES)] : [])
                  }
                />
                <span className="text-sm font-medium">{day.label}</span>
              </div>
              <div className="grid gap-2">
                {open ? (
                  intervals.map((interval, index) => {
                    const prefix = index === 0 ? day.label : `${day.label} period ${index + 1}`;
                    const updateInterval = (patch: Partial<DraftInterval>) =>
                      setDay(
                        day.value,
                        intervals.map((entry) =>
                          entry.key === interval.key ? { ...entry, ...patch } : entry,
                        ),
                      );
                    return (
                      <div key={interval.key} className="flex flex-wrap items-center gap-2">
                        <Input
                          type="time"
                          aria-label={`${prefix} opens at`}
                          aria-invalid={dayError ? true : undefined}
                          aria-describedby={dayError ? errorId : undefined}
                          className="w-32"
                          value={interval.opensAt}
                          onChange={(event) => updateInterval({ opensAt: event.target.value })}
                        />
                        <span className="text-sm text-muted-foreground">to</span>
                        <Input
                          type="time"
                          aria-label={`${prefix} closes at`}
                          aria-invalid={dayError ? true : undefined}
                          aria-describedby={dayError ? errorId : undefined}
                          className="w-32"
                          value={interval.closesAt}
                          onChange={(event) => updateInterval({ closesAt: event.target.value })}
                        />
                        {interval.opensAt &&
                        interval.closesAt &&
                        interval.opensAt !== interval.closesAt &&
                        isOvernight(interval) ? (
                          <Badge variant="secondary">
                            <Moon aria-hidden="true" />
                            Closes next day
                          </Badge>
                        ) : null}
                        {intervals.length > 1 ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-9"
                            aria-label={`Remove ${prefix} hours`}
                            onClick={() =>
                              setDay(
                                day.value,
                                intervals.filter((entry) => entry.key !== interval.key),
                              )
                            }
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="py-2 text-sm text-muted-foreground">Closed</p>
                )}
                {open ? (
                  <div className="flex flex-wrap gap-1">
                    {intervals.length < 4 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Add hours on ${day.label}`}
                        onClick={() =>
                          setDay(day.value, [...intervals, draft(DEFAULT_OPENS, DEFAULT_CLOSES)])
                        }
                      >
                        <Plus aria-hidden="true" />
                        Add hours
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Copy ${day.label} hours to all days`}
                      onClick={() => copyToAll(day.value)}
                    >
                      <Copy aria-hidden="true" />
                      Copy to all days
                    </Button>
                  </div>
                ) : null}
                {dayError ? (
                  <p id={errorId} className="text-sm text-destructive">
                    {dayError}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <FormActions mode={mode} pending={isLoading} onBack={onBack} />
    </form>
  );
}
