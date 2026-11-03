import { HttpStatus, Injectable } from '@nestjs/common';
import {
  formatLimit,
  type LimitedResource,
  RESOURCE_LABELS,
  type SubscriptionState,
  type Usage,
} from '@app/contracts';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CURRENT_SUBSCRIPTION_STATUSES, standingOf } from './domain/subscription-status.js';

type Db = Pick<
  Prisma.TransactionClient,
  'subscription' | 'branch' | 'product' | 'rider' | 'membership' | 'organization'
>;

const subscriptionSelect = {
  status: true,
  trialEndsAt: true,
  currentPeriodEnd: true,
  graceEndsAt: true,
  suspendedAt: true,
  cancelAtPeriodEnd: true,
  plan: {
    select: { name: true, maxBranches: true, maxProducts: true, maxRiders: true, maxMembers: true },
  },
} satisfies Prisma.SubscriptionSelect;

type SubscriptionRow = Prisma.SubscriptionGetPayload<{ select: typeof subscriptionSelect }>;

function limitFor(row: SubscriptionRow | null, resource: LimitedResource): number | null {
  if (!row) {
    return null;
  }
  switch (resource) {
    case 'branches':
      return row.plan.maxBranches;
    case 'products':
      return row.plan.maxProducts;
    case 'riders':
      return row.plan.maxRiders;
    case 'members':
      return row.plan.maxMembers;
  }
}

async function countUsage(
  db: Db,
  organizationId: string,
  resource: LimitedResource,
): Promise<number> {
  switch (resource) {
    case 'branches':
      return db.branch.count({ where: { organizationId, status: { not: 'CLOSED' } } });
    case 'products':
      return db.product.count({ where: { organizationId, archivedAt: null } });
    case 'riders':
      return db.rider.count({ where: { organizationId, status: 'ACTIVE' } });
    case 'members':
      return db.membership.count({
        where: { organizationId, status: { in: ['ACTIVE', 'INVITED'] } },
      });
  }
}

export function subscriptionInactive(): AppException {
  return new AppException(
    HttpStatus.PAYMENT_REQUIRED,
    'SUBSCRIPTION_INACTIVE',
    'Your subscription is not active. Existing data and orders are kept, but you cannot add new items until the subscription is renewed on the Billing page.',
  );
}

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async current(organizationId: string, db: Db = this.prisma): Promise<SubscriptionRow | null> {
    const current = await db.subscription.findFirst({
      where: { organizationId, status: { in: [...CURRENT_SUBSCRIPTION_STATUSES] } },
      select: subscriptionSelect,
    });
    if (current) {
      return current;
    }
    return db.subscription.findFirst({
      where: { organizationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: subscriptionSelect,
    });
  }

  async canTakeOrders(organizationId: string, db: Db = this.prisma): Promise<boolean> {
    const row = await this.current(organizationId, db);
    return standingOf(row?.status ?? null) !== 'restricted';
  }

  async state(organizationId: string): Promise<SubscriptionState> {
    const [row, organization] = await Promise.all([
      this.current(organizationId),
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { timezone: true },
      }),
    ]);
    const usage: Usage[] = await Promise.all(
      (['branches', 'products', 'riders', 'members'] as const).map(async (resource) => ({
        resource,
        used: await countUsage(this.prisma, organizationId, resource),
        limit: limitFor(row, resource),
      })),
    );
    const standing = standingOf(row?.status ?? null);
    return {
      standing,
      canTakeOrders: standing !== 'restricted',
      status: row?.status ?? null,
      planName: row?.plan.name ?? null,
      trialEndsAt: row?.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: row?.currentPeriodEnd.toISOString() ?? null,
      graceEndsAt: row?.graceEndsAt?.toISOString() ?? null,
      suspendedAt: row?.suspendedAt?.toISOString() ?? null,
      cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
      timezone: organization.timezone,
      usage,
    };
  }

  async assertCanAdd(
    organizationId: string,
    resource: LimitedResource,
    db: Db = this.prisma,
  ): Promise<void> {
    const row = await this.current(organizationId, db);
    if (standingOf(row?.status ?? null) === 'restricted') {
      throw subscriptionInactive();
    }
    const limit = limitFor(row, resource);
    if (limit === null) {
      return;
    }
    const used = await countUsage(db, organizationId, resource);
    if (used >= limit) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PLAN_LIMIT_REACHED',
        `Your ${row?.plan.name ?? ''} plan includes ${formatLimit(resource, limit)}. Remove one or change your plan on the Billing page to add more ${RESOURCE_LABELS[resource][1]}.`,
      );
    }
  }
}
