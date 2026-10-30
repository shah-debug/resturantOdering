import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { formatRupees } from '@app/contracts';
import { z } from 'zod';
import { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Mailer, type MailMessage } from '../mail/mailer.js';
import { NotificationTemplate } from './notification-outbox.js';

export const MAX_NOTIFICATION_ATTEMPTS = 5;
const CLAIM_LEASE_SECONDS = 120;
const RETRY_BASE_SECONDS = 30;

interface ClaimedNotification {
  id: string;
  organization_id: string;
  template: string;
  recipient: string;
  payload: unknown;
  attempts: number;
}

const orderPlacedPayloadSchema = z.object({
  orderId: z.uuid(),
  orderNumber: z.number().int(),
  restaurantName: z.string(),
  customerName: z.string(),
  type: z.enum(['DELIVERY', 'PICKUP']),
  totalMinor: z.number().int(),
  itemCount: z.number().int(),
});

export class UnknownTemplateError extends Error {}

export function retryDelaySeconds(attempts: number): number {
  return RETRY_BASE_SECONDS * 2 ** Math.max(0, attempts - 1);
}

export interface DispatchResult {
  sent: number;
  retried: number;
  failed: number;
}

@Injectable()
export class NotificationDispatcher implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatcher.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.config.notificationDispatchIntervalSeconds;
    if (seconds > 0) {
      this.timer = setInterval(() => void this.tick(), seconds * 1000);
      this.timer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.dispatchDue();
    } catch (error) {
      this.logger.error(
        `Notification dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  async dispatchDue(limit = 20): Promise<DispatchResult> {
    const claimed = await this.prisma.$queryRaw<ClaimedNotification[]>`
      UPDATE notifications
      SET attempts = attempts + 1,
          scheduled_at = now() + make_interval(secs => ${CLAIM_LEASE_SECONDS}),
          updated_at = now()
      WHERE id IN (
        SELECT id FROM notifications
        WHERE status = 'PENDING' AND channel = 'EMAIL' AND scheduled_at <= now()
        ORDER BY scheduled_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, organization_id, template, recipient, payload, attempts`;

    const result: DispatchResult = { sent: 0, retried: 0, failed: 0 };
    for (const notification of claimed) {
      try {
        await this.mailer.send(this.render(notification));
        const updated = await this.prisma.notification.updateMany({
          where: { id: notification.id, status: 'PENDING' },
          data: { status: 'SENT', sentAt: new Date(), lastError: null },
        });
        if (updated.count === 1) {
          result.sent += 1;
        }
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
        const giveUp =
          error instanceof UnknownTemplateError ||
          notification.attempts >= MAX_NOTIFICATION_ATTEMPTS;
        if (giveUp) {
          await this.prisma.notification.updateMany({
            where: { id: notification.id, status: 'PENDING' },
            data: { status: 'FAILED', lastError: message },
          });
        } else {
          await this.prisma.$executeRaw`
            UPDATE notifications
            SET last_error = ${message},
                scheduled_at = now() + make_interval(secs => ${retryDelaySeconds(notification.attempts)}),
                updated_at = now()
            WHERE id = ${notification.id}::uuid AND status = 'PENDING'`;
        }
        if (giveUp) {
          result.failed += 1;
          this.logger.error(`Notification ${notification.id} failed permanently: ${message}`);
        } else {
          result.retried += 1;
          this.logger.warn(`Notification ${notification.id} will be retried: ${message}`);
        }
      }
    }
    return result;
  }

  private render(notification: ClaimedNotification): MailMessage {
    if (notification.template !== NotificationTemplate.OrderPlacedStaff) {
      throw new UnknownTemplateError(`Unknown notification template ${notification.template}`);
    }
    const payload = orderPlacedPayloadSchema.parse(notification.payload);
    const link = `${this.config.dashboardUrl}/organizations/${notification.organization_id}/orders/${payload.orderId}`;
    return {
      to: notification.recipient,
      subject: `New order #${payload.orderNumber} · ${formatRupees(payload.totalMinor)}`,
      text: [
        `${payload.restaurantName} has a new ${payload.type === 'DELIVERY' ? 'delivery' : 'pickup'} order.`,
        '',
        `Order #${payload.orderNumber} from ${payload.customerName}`,
        `${payload.itemCount} item${payload.itemCount === 1 ? '' : 's'} · ${formatRupees(payload.totalMinor)} (cash)`,
        '',
        `Open the order: ${link}`,
      ].join('\n'),
    };
  }
}
