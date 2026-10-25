import { type ReactNode, useId } from 'react';
import { cn } from '../../lib/cn';
import { Label } from './label';

export interface FieldControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

export interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
