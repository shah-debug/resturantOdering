import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type AlertVariant = 'default' | 'destructive' | 'success';

const variantClasses: Record<AlertVariant, string> = {
  default: 'bg-card text-card-foreground',
  destructive: 'border-destructive/50 text-destructive',
  success: 'border-success/50 text-foreground',
};

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: AlertVariant;
  title?: string;
}

export function Alert({ variant = 'default', title, className, children, ...props }: AlertProps) {
  return (
    <div
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn(
        'grid gap-1 rounded-lg border px-4 py-3 text-sm',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className="leading-relaxed">{children}</div> : null}
    </div>
  );
}
