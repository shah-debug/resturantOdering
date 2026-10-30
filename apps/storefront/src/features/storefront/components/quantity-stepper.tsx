'use client';

import { Button } from '@app/web/ui';
import { Minus, Plus, Trash2 } from 'lucide-react';

export function QuantityStepper({
  value,
  min,
  max,
  label,
  onChange,
  disabled = false,
  removeAtMin = false,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  removeAtMin?: boolean;
}) {
  const showRemove = removeAtMin && value <= min;
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${label}`}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9"
        disabled={disabled || (!removeAtMin && value <= min)}
        aria-label={showRemove ? `Remove ${label}` : `Decrease quantity of ${label}`}
        onClick={() => onChange(value - 1)}
      >
        {showRemove ? <Trash2 aria-hidden="true" /> : <Minus aria-hidden="true" />}
      </Button>
      <output className="w-8 text-center text-sm font-medium tabular-nums" aria-live="polite">
        {value}
      </output>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9"
        disabled={disabled || value >= max}
        aria-label={`Increase quantity of ${label}`}
        onClick={() => onChange(value + 1)}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
}
