'use client';

import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { CircleAlert, type LucideIcon, SearchX, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getErrorMessage } from '@app/web/api';
import { Button, Skeleton } from '@app/web/ui';
import { hasHttpStatus } from '@/lib/api';
import { cn } from '@/lib/utils';

type QueryError = FetchBaseQueryError | SerializedError | undefined;

export function LoadingState({
  label = 'Loading…',
  rows = 3,
  className,
}: {
  label?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn('grid gap-4', className)}>
      <span className="sr-only">{label}</span>
      <Skeleton className="h-7 w-48 max-w-full" />
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:p-6">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="grid gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StateFrame({
  icon: Icon,
  tone = 'muted',
  title,
  children,
  action,
  className,
  role,
}: {
  icon: LucideIcon;
  tone?: 'muted' | 'destructive';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  role?: 'alert';
}) {
  return (
    <div
      role={role}
      className={cn(
        'grid justify-items-center gap-3 rounded-xl border border-dashed bg-card px-4 py-10 text-center sm:px-8',
        className,
      )}
    >
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-full',
          tone === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-muted',
        )}
      >
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="grid max-w-md gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {children ? <div className="text-sm text-muted-foreground">{children}</div> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StateFrame icon={icon} title={title} action={action} className={className}>
      {description}
    </StateFrame>
  );
}

export function ErrorState({
  title = "We couldn't load this",
  error,
  onRetry,
  retrying = false,
  className,
}: {
  title?: string;
  error: QueryError;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <StateFrame
      role="alert"
      icon={CircleAlert}
      tone="destructive"
      title={title}
      className={className}
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry} pending={retrying} pendingText="Retrying…">
            Retry
          </Button>
        ) : null
      }
    >
      <p>{getErrorMessage(error)}</p>
    </StateFrame>
  );
}

export function isUnavailableError(error: QueryError): boolean {
  return hasHttpStatus(error, 403, 404);
}

export function UnavailableState({ error }: { error: QueryError }) {
  const forbidden = hasHttpStatus(error, 403);
  return (
    <StateFrame
      role="alert"
      icon={forbidden ? ShieldAlert : SearchX}
      title={forbidden ? "You don't have access to this" : 'Restaurant not found'}
      action={
        <Button asChild variant="outline">
          <Link href="/">Back to your restaurants</Link>
        </Button>
      }
    >
      <p>{getErrorMessage(error)}</p>
      <p className="mt-1">
        {forbidden
          ? 'Your role in this restaurant does not include this page. Ask an owner if you need access.'
          : 'It may have been removed, or you may no longer be a member.'}
      </p>
    </StateFrame>
  );
}
