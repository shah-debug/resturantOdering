import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type AlertVariant = 'default' | 'destructive' | 'success' | 'warning';

const variantClasses: Record<AlertVariant, string> = {
  default: 'bg-card text-card-foreground',
  destructive: 'border-destructive/50 bg-destructive/5 text-destructive',
  success: 'border-success/50 bg-success/5 text-foreground',
  warning: 'border-warning/60 bg-warning/10 text-foreground',
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
        'grid animate-fade-in gap-1 rounded-lg border px-4 py-3 text-sm',
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
