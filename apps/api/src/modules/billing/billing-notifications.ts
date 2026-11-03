import { formatRupees } from '@app/contracts';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import type { MailMessage } from '../mail/mailer.js';

export const BILLING_TEMPLATES = [
  'billing.renewal_due',
  'billing.past_due',
  'billing.grace_ending',
  'billing.suspended',
  'billing.payment_verified',
  'billing.payment_rejected',
] as const;
export type BillingTemplate = (typeof BILLING_TEMPLATES)[number];

export const billingPayloadSchema = z.object({
  organizationName: z.string(),
  planName: z.string(),
  timezone: z.string(),
  invoiceNumber: z.string().nullable(),
  amountMinor: z.number().int().nullable(),
  dueAt: z.iso.datetime().nullable(),
  graceEndsAt: z.iso.datetime().nullable(),
  reason: z.string().nullable(),
});
export type BillingPayload = z.infer<typeof billingPayloadSchema>;

export function isBillingTemplate(template: string): template is BillingTemplate {
  return (BILLING_TEMPLATES as readonly string[]).includes(template);
}

function localDate(iso: string | null, timeZone: string): string {
  return iso
    ? new Intl.DateTimeFormat('en-PK', { dateStyle: 'long', timeZone }).format(new Date(iso))
    : '';
}

export function renderBillingEmail(
  template: BillingTemplate,
  recipient: string,
  rawPayload: unknown,
  billingUrl: string,
): MailMessage {
  const payload = billingPayloadSchema.parse(rawPayload);
  const amount = payload.amountMinor === null ? '' : formatRupees(payload.amountMinor);
  const due = localDate(payload.dueAt, payload.timezone);
  const grace = localDate(payload.graceEndsAt, payload.timezone);
  const lines: Record<BillingTemplate, [string, string[]]> = {
    'billing.renewal_due': [
      `${payload.organizationName}: ${payload.planName} renews on ${due}`,
      [
        `Invoice ${payload.invoiceNumber ?? ''} for ${amount} is due on ${due}.`,
        'Pay using the instructions on the Billing page, then record the payment reference there.',
      ],
    ],
    'billing.past_due': [
      `${payload.organizationName}: payment overdue`,
      [
        `We have not received a verified payment for invoice ${payload.invoiceNumber ?? ''} (${amount}).`,
        `Your restaurant keeps working until ${grace}. After that, online ordering is paused until payment is verified.`,
      ],
    ],
    'billing.grace_ending': [
      `${payload.organizationName}: online ordering pauses on ${grace}`,
      [
        `Invoice ${payload.invoiceNumber ?? ''} (${amount}) is still unpaid.`,
        'Record your payment on the Billing page to avoid interruption.',
      ],
    ],
    'billing.suspended': [
      `${payload.organizationName}: online ordering paused`,
      [
        'Your subscription is suspended because payment was not verified in time.',
        'Your menu, orders and other data are kept. Ordering resumes as soon as a payment is verified.',
      ],
    ],
    'billing.payment_verified': [
      `${payload.organizationName}: payment received`,
      [
        `Your payment for invoice ${payload.invoiceNumber ?? ''} (${amount}) has been verified. Thank you.`,
      ],
    ],
    'billing.payment_rejected': [
      `${payload.organizationName}: we could not verify your payment`,
      [
        `Your payment for invoice ${payload.invoiceNumber ?? ''} could not be verified.`,
        `Reason: ${payload.reason ?? 'not given'}.`,
        'Please check the details and record the payment again.',
      ],
    ],
  };
  const [subject, body] = lines[template];
  return { to: recipient, subject, text: [...body, '', `Billing: ${billingUrl}`].join('\n') };
}

export async function enqueueBillingEmail(
  db: Pick<Prisma.TransactionClient, 'notification' | 'organization' | 'membership'>,
  organizationId: string,
  template: BillingTemplate,
  dedupeKey: string,
  payload: BillingPayload,
): Promise<void> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { contactEmail: true },
  });
  const owner = organization?.contactEmail
    ? null
    : await db.membership.findFirst({
        where: { organizationId, role: 'OWNER', status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: { user: { select: { email: true } } },
      });
  const recipient = organization?.contactEmail ?? owner?.user.email ?? null;
  if (!recipient) {
    return;
  }
  await db.notification.createMany({
    data: [
      {
        organizationId,
        channel: 'EMAIL',
        template,
        recipient,
        payload: { ...payload },
        dedupeKey,
      },
    ],
    skipDuplicates: true,
  });
}
