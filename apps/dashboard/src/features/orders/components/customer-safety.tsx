'use client';

import type { OrderDetail } from '@app/contracts';
import { getErrorMessage } from '@app/web/api';
import { Alert, Button, Field, Input } from '@app/web/ui';
import { type FormEvent, useState } from 'react';
import { useSetCustomerBlockedMutation } from '../orders-api';

export function canSeeCustomerContact(order: OrderDetail): boolean {
  return /^\+\d+$/.test(order.customerPhone);
}

export function CustomerSafety({
  organizationId,
  order,
}: {
  organizationId: string;
  order: OrderDetail;
}) {
  const [setBlocked, state] = useSetCustomerBlockedMutation();
  const [blocking, setBlocking] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canAct = canSeeCustomerContact(order);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 5) {
      setError('Give a reason of at least 5 characters. It is kept in the audit log.');
      return;
    }
    setError(null);
    try {
      await setBlocked({
        organizationId,
        orderId: order.id,
        body: { blocked: true, reason: reason.trim() },
      }).unwrap();
      setBlocking(false);
      setReason('');
    } catch (caught) {
      setError(getErrorMessage(caught as Parameters<typeof getErrorMessage>[0]));
    }
  }

  async function unblock() {
    setError(null);
    try {
      await setBlocked({ organizationId, orderId: order.id, body: { blocked: false } }).unwrap();
    } catch (caught) {
      setError(getErrorMessage(caught as Parameters<typeof getErrorMessage>[0]));
    }
  }

  return (
    <div className="grid gap-2">
      {order.customerOrderCount <= 1 && !order.customerBlocked ? (
        <Alert title="First order from this number">
          Call the customer to confirm before you start cooking.
        </Alert>
      ) : null}
      {order.customerBlocked ? (
        <Alert variant="destructive" title="This number is blocked">
          New online orders from this phone number are refused.
        </Alert>
      ) : null}
      {canAct && order.customerBlocked ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={state.isLoading}
          onClick={() => void unblock()}
        >
          Unblock this number
        </Button>
      ) : null}
      {canAct && !order.customerBlocked && !blocking ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => setBlocking(true)}
        >
          Block this number
        </Button>
      ) : null}
      {blocking ? (
        <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-2">
          <Field label="Why are you blocking this number?" error={error ?? undefined}>
            {(control) => (
              <Input
                {...control}
                maxLength={300}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" size="sm" disabled={state.isLoading}>
              Block number
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setBlocking(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : error ? (
        <Alert variant="destructive">{error}</Alert>
      ) : null}
    </div>
  );
}
