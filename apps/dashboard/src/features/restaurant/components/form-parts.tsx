'use client';

import { Lock } from 'lucide-react';
import { Alert, Button } from '@app/web/ui';

export type FormMode = 'onboarding' | 'settings';

export interface StepFormProps {
  organizationId: string;
  mode: FormMode;
  onSaved?: () => void;
  onBack?: () => void;
}

export function FormActions({
  mode,
  pending,
  onBack,
}: {
  mode: FormMode;
  pending: boolean;
  onBack?: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      {mode === 'onboarding' && onBack ? (
        <Button variant="outline" onClick={onBack} disabled={pending}>
          Back
        </Button>
      ) : (
        <span aria-hidden="true" />
      )}
      <Button type="submit" pending={pending} pendingText="Saving…">
        {mode === 'onboarding' ? 'Save and continue' : 'Save changes'}
      </Button>
    </div>
  );
}

export function SavedNotice({ show, children }: { show: boolean; children: string }) {
  return show ? <Alert variant="success">{children}</Alert> : null;
}

export function ReadOnlyNotice({ roleLabel }: { roleLabel?: string | undefined }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border bg-muted/50 px-4 py-3 text-sm"
    >
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="grid gap-1">
        <p className="font-medium">View only</p>
        <p className="text-muted-foreground">
          {roleLabel ? `As ${roleLabel.toLowerCase()}, you can view` : 'You can view'} these
          settings, but only owners and managers can change them.
        </p>
      </div>
    </div>
  );
}
