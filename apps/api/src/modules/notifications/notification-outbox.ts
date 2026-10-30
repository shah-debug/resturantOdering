import type { Prisma } from '../../generated/prisma/client.js';

export const NotificationTemplate = {
  OrderPlacedStaff: 'order.placed.staff',
} as const;

export type NotificationTemplate = (typeof NotificationTemplate)[keyof typeof NotificationTemplate];

export interface OrderPlacedPayload {
  orderId: string;
  orderNumber: number;
  restaurantName: string;
  customerName: string;
  type: 'DELIVERY' | 'PICKUP';
  totalMinor: number;
  itemCount: number;
}

export async function enqueueOrderPlacedEmail(
  tx: Pick<Prisma.TransactionClient, 'notification'>,
  organizationId: string,
  recipient: string | null,
  payload: OrderPlacedPayload,
): Promise<void> {
  if (!recipient) {
    return;
  }
  await tx.notification.createMany({
    data: [
      {
        organizationId,
        channel: 'EMAIL',
        template: NotificationTemplate.OrderPlacedStaff,
        recipient,
        orderId: payload.orderId,
        payload: { ...payload },
        dedupeKey: `${NotificationTemplate.OrderPlacedStaff}:${payload.orderId}:${recipient}`,
      },
    ],
    skipDuplicates: true,
  });
}
