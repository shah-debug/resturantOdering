import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { controlClasses } from './input';

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClasses, 'pr-8', className)} {...props} />;
}
