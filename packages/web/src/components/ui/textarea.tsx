import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';
import { controlClasses } from './input';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlClasses, 'h-auto min-h-24 resize-y', className)}
      {...props}
    />
  );
}
