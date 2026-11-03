'use client';

import { getErrorMessage } from '@app/web/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Select,
  Textarea,
} from '@app/web/ui';
import { type FormEvent, useState } from 'react';
import { useCancelSubscriptionMutation } from '../billing-admin-api';

export function CancelSubscriptionDialog({
  organizationId,
  restaurantName,
  canEndAtPeriodEnd,
  onClose,
}: {
  organizationId: string;
  restaurantName: string;
  canEndAtPeriodEnd: boolean;
  onClose: () => void;
}) {
  const [cancel, state] = useCancelSubscriptionMutation();
  const [mode, setMode] = useState<'NOW' | 'PERIOD_END'>(canEndAtPeriodEnd ? 'PERIOD_END' : 'NOW');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 5) {
      setError('Give a reason of at least 5 characters. It is saved in the audit log.');
      return;
    }
    try {
      await cancel({ organizationId, body: { mode, reason: reason.trim() } }).unwrap();
      onClose();
    } catch (caught) {
      setError(getErrorMessage(caught as Parameters<typeof getErrorMessage>[0]));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Cancel subscription for {restaurantName}</DialogTitle>
            <DialogDescription>
              Online ordering pauses once the subscription ends. Menus, orders and other data are
              kept, and a new plan can be assigned later.
            </DialogDescription>
          </DialogHeader>
          <Field label="When">
            {(control) => (
              <Select
                {...control}
                value={mode}
                onChange={(event) => setMode(event.target.value as 'NOW' | 'PERIOD_END')}
              >
                {canEndAtPeriodEnd ? (
                  <option value="PERIOD_END">At the end of the current period</option>
                ) : null}
                <option value="NOW">Immediately</option>
              </Select>
            )}
          </Field>
          <Field label="Reason" error={error ?? undefined}>
            {(control) => (
              <Textarea
                {...control}
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Keep subscription
            </Button>
            <Button type="submit" variant="destructive" disabled={state.isLoading}>
              Cancel subscription
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
