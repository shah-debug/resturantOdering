import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        'animate-shimmer rounded-md bg-[linear-gradient(90deg,var(--muted)_25%,color-mix(in_oklch,var(--muted),var(--background)_60%)_50%,var(--muted)_75%)] bg-[length:200%_100%]',
        className,
      )}
      {...props}
    />
  );
}
