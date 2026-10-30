'use client';

import type { OrderStatus } from '@app/contracts';
import { getErrorMessage } from '@app/web/api';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Textarea,
} from '@app/web/ui';
import { type FormEvent, useState } from 'react';
import { isDestructiveTransition, REASON_PROMPTS, TRANSITION_LABELS } from '../order-labels';
import { useTransitionOrderMutation } from '../orders-api';

export function TransitionControls({
  organizationId,
  orderId,
  orderNumber,
  status,
  transitions,
  size = 'default',
  only,
}: {
  organizationId: string;
  orderId: string;
  orderNumber: number;
  status: OrderStatus;
  transitions: readonly OrderStatus[];
  size?: 'default' | 'sm' | 'lg';
  only?: 'quick';
}) {
  const [transition, state] = useTransitionOrderMutation();
  const [asking, setAsking] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const visible = only === 'quick' ? transitions.filter((to) => !REASON_PROMPTS[to]) : transitions;

  async function run(to: OrderStatus, withReason?: string) {
    setError(null);
    try {
      await transition({
        organizationId,
        orderId,
        body: { to, expectedStatus: status, ...(withReason ? { reason: withReason } : {}) },
      }).unwrap();
      setAsking(null);
      setReason('');
    } catch (caught) {
      setError(getErrorMessage(caught as Parameters<typeof getErrorMessage>[0]));
    }
  }

  function submitReason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asking) {
      return;
    }
    if (reason.trim().length < 3) {
      setReasonError('Give a short reason (at least 3 characters)');
      return;
    }
    void run(asking, reason.trim());
  }

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {visible.map((to) => (
          <Button
            key={to}
            type="button"
            size={size}
            variant={isDestructiveTransition(to) ? 'outline' : 'default'}
            disabled={state.isLoading}
            onClick={() => {
              if (REASON_PROMPTS[to]) {
                setReason('');
                setReasonError(undefined);
                setAsking(to);
              } else {
                void run(to);
              }
            }}
            aria-label={`${TRANSITION_LABELS[to]} order #${orderNumber}`}
          >
            {TRANSITION_LABELS[to]}
          </Button>
        ))}
      </div>
      {error && !asking ? <Alert variant="destructive">{error}</Alert> : null}

      <Dialog open={asking !== null} onOpenChange={(open) => (open ? null : setAsking(null))}>
        <DialogContent>
          <form onSubmit={submitReason} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>
                {asking ? TRANSITION_LABELS[asking] : ''} · order #{orderNumber}
              </DialogTitle>
              <DialogDescription>
                {asking ? REASON_PROMPTS[asking] : ''} The reason is kept in the order history and
                is not shown to the customer.
              </DialogDescription>
            </DialogHeader>
            <Field label="Reason" error={reasonError}>
              {(control) => (
                <Textarea
                  {...control}
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setReasonError(undefined);
                  }}
                />
              )}
            </Field>
            {error ? <Alert variant="destructive">{error}</Alert> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAsking(null)}>
                Keep order
              </Button>
              <Button type="submit" variant="destructive" disabled={state.isLoading}>
                {asking ? TRANSITION_LABELS[asking] : 'Confirm'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
