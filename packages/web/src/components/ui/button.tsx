import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'default' | 'outline' | 'secondary' | 'destructive' | 'ghost' | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
  outline: 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  destructive: 'bg-destructive text-white shadow-xs hover:bg-destructive/90',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-foreground underline-offset-4 hover:underline',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-10 px-4 py-2',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-11 px-6',
};

export function buttonVariants({
  variant = 'default',
  size = 'default',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
    'disabled:pointer-events-none disabled:opacity-50',
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pending?: boolean;
  pendingText?: string;
}

export function Button({
  variant,
  size,
  pending = false,
  pendingText,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={buttonVariants({ variant, size, className })}
      {...props}
    >
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
