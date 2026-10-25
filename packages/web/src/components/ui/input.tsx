import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export const controlClasses = cn(
  'flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs transition-colors sm:text-sm',
  'placeholder:text-muted-foreground',
  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
);

export function Input({
  className,
  type = 'text',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={cn(controlClasses, className)} {...props} />;
}
