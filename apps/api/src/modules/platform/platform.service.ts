import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AuditEntry,
  auditQuerySchema,
  createPlanRequestSchema,
  type Paginated,
  type Plan,
  type PlatformHealth,
  type PlatformOrganization,
  type PlatformOrganizationDetail,
  platformOrganizationQuerySchema,
  organizationStatusChangeSchema,
  type SubscriptionOverview,
  subscriptionAssignmentSchema,
  type SubscriptionSummary,
  toCsv,
} from '@app/contracts';
import { z } from 'zod';
import { AppException } from '../../common/errors/app.exception.js';
import { assertValid } from '../../common/validation/schema.js';
import { DatabaseHealthService } from '../../database/database-health.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PlatformRole } from '../../generated/prisma/enums.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { AuthContext, RequestMeta } from '../auth/http/request-context.js';
import { OrderEventsService } from '../orders/order-events.service.js';

const DAY_MS = 86_400_000;
const CURRENT_SUBSCRIPTION = ['TRIALING', 'ACTIVE', 'PAST_DUE'] as const;
const EXPORT_LIMIT = 10_000;

const subscriptionSelect = {
  id: true,
  planId: true,
  status: true,
  priceMinor: true,
  currency: true,
  billingInterval: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  trialEndsAt: true,
  canceledAt: true,
  createdAt: true,
  plan: { select: { code: true, name: true } },
} satisfies Prisma.SubscriptionSelect;

type SubscriptionRow = Prisma.SubscriptionGetPayload<{ select: typeof subscriptionSelect }>;

function toSubscription(row: SubscriptionRow): SubscriptionSummary {
  return {
    id: row.id,
    planId: row.planId,
    planCode: row.plan.code,
    planName: row.plan.name,
    status: row.status,
    priceMinor: row.priceMinor,
    currency: row.currency,
    billingInterval: row.billingInterval,
    currentPeriodStart: row.currentPeriodStart.toISOString(),
    currentPeriodEnd: row.currentPeriodEnd.toISOString(),
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const auditSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  organizationId: true,
  changes: true,
  ipAddress: true,
  createdAt: true,
  organization: { select: { name: true } },
  actorUser: { select: { fullName: true, email: true } },
} satisfies Prisma.AuditLogSelect;

type AuditRow = Prisma.AuditLogGetPayload<{ select: typeof auditSelect }>;

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Restaurant not found');
}

function addInterval(start: Date, interval: 'MONTHLY' | 'YEARLY', trialDays: number | null): Date {
  if (trialDays !== null) {
    return new Date(start.getTime() + trialDays * DAY_MS);
  }
  const end = new Date(start);
  if (interval === 'MONTHLY') {
    end.setUTCMonth(end.getUTCMonth() + 1);
  } else {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  }
  return end;
}

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly databaseHealth: DatabaseHealthService,
    private readonly orderEvents: OrderEventsService,
  ) {}

  private organizationWhere(search?: string, status?: string): Prisma.OrganizationWhereInput {
    return {
      ...(status ? { status: status as Prisma.OrganizationWhereInput['status'] } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search.toLowerCase() } },
              {
                memberships: {
                  some: {
                    role: 'OWNER',
                    user: { email: { contains: search.toLowerCase() } },
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private organizationListSelect(since: Date) {
    return {
      id: true,
      name: true,
      slug: true,
      status: true,
      createdAt: true,
      onboardingCompletedAt: true,
      memberships: {
        where: { role: 'OWNER', status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { user: { select: { fullName: true, email: true } } },
      },
      subscriptions: {
        where: { status: { in: [...CURRENT_SUBSCRIPTION] } },
        take: 1,
        select: subscriptionSelect,
      },
      _count: {
        select: {
          branches: true,
          orders: { where: { placedAt: { gte: since } } },
        },
      },
    } satisfies Prisma.OrganizationSelect;
  }

  private toListItem(
    row: Prisma.OrganizationGetPayload<{
      select: ReturnType<PlatformService['organizationListSelect']>;
    }>,
  ): PlatformOrganization {
    const owner = row.memberships[0]?.user ?? null;
    const subscription = row.subscriptions[0];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      onboardingCompletedAt: row.onboardingCompletedAt?.toISOString() ?? null,
      owner,
      branchCount: row._count.branches,
      ordersLast30Days: row._count.orders,
      subscription: subscription ? toSubscription(subscription) : null,
    };
  }

  async listOrganizations(rawQuery: unknown): Promise<Paginated<PlatformOrganization>> {
    const query = assertValid(platformOrganizationQuerySchema, rawQuery);
    const where = this.organizationWhere(query.search, query.status);
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [total, rows] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: this.organizationListSelect(since),
      }),
    ]);
    return {
      items: rows.map((row) => this.toListItem(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  private toAudit(row: AuditRow, includeIp: boolean): AuditEntry {
    return {
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      organizationId: row.organizationId,
      organizationName: row.organization?.name ?? null,
      actor: row.actorUser,
      changes: row.changes,
      ipAddress: includeIp ? row.ipAddress : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async organizationDetail(
    auth: AuthContext,
    organizationId: string,
  ): Promise<PlatformOrganizationDetail> {
    if (!z.uuid().safeParse(organizationId).success) {
      throw notFound();
    }
    const since = new Date(Date.now() - 30 * DAY_MS);
    const row = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        ...this.organizationListSelect(since),
        description: true,
        contactEmail: true,
        contactPhone: true,
        timezone: true,
        branches: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, city: true, status: true },
        },
      },
    });
    if (!row) {
      throw notFound();
    }
    const [memberCount, subscriptions, completed, lastOrder, audit] = await Promise.all([
      this.prisma.membership.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.prisma.subscription.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: subscriptionSelect,
      }),
      this.prisma.order.count({
        where: {
          organizationId,
          placedAt: { gte: since },
          status: { in: ['DELIVERED', 'COMPLETED'] },
        },
      }),
      this.prisma.order.findFirst({
        where: { organizationId },
        orderBy: { placedAt: 'desc' },
        select: { placedAt: true },
      }),
      this.prisma.auditLog.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 25,
        select: auditSelect,
      }),
    ]);
    const includeIp = auth.user.platformRole === PlatformRole.SUPER_ADMIN;
    return {
      ...this.toListItem(row),
      description: row.description,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      timezone: row.timezone,
      memberCount,
      branches: row.branches,
      subscriptions: subscriptions.map(toSubscription),
      activity: {
        ordersLast30Days: row._count.orders,
        completedLast30Days: completed,
        lastOrderAt: lastOrder?.placedAt.toISOString() ?? null,
      },
      recentAudit: audit.map((entry) => this.toAudit(entry, includeIp)),
    };
  }

  async changeStatus(
    auth: AuthContext,
    organizationId: string,
    body: unknown,
    meta: RequestMeta,
  ): Promise<PlatformOrganizationDetail> {
    const dto = assertValid(organizationStatusChangeSchema, body);
    if (!z.uuid().safeParse(organizationId).success) {
      throw notFound();
    }
    const current = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { status: true },
    });
    if (!current) {
      throw notFound();
    }
    if (current.status !== dto.expectedStatus) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        `This restaurant is now ${current.status}. Refresh and try again.`,
      );
    }
    if (current.status === dto.status) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        `This restaurant is already ${dto.status}.`,
      );
    }
    if (current.status === 'CLOSED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'Closed restaurants cannot be reopened. Create a new restaurant instead.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.organization.updateMany({
        where: { id: organizationId, status: dto.expectedStatus },
        data: { status: dto.status },
      });
      if (updated.count !== 1) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'CONFLICT',
          'This restaurant was just changed. Refresh and try again.',
        );
      }
      await this.audit.record(
        {
          action: AuditAction.PlatformOrganizationStatusChanged,
          actorUserId: auth.user.id,
          organizationId,
          entityType: 'organization',
          entityId: organizationId,
          changes: { from: dto.expectedStatus, to: dto.status, reason: dto.reason },
          meta,
        },
        tx,
      );
    });
    return this.organizationDetail(auth, organizationId);
  }

  async assignSubscription(
    auth: AuthContext,
    organizationId: string,
    body: unknown,
    meta: RequestMeta,
  ): Promise<PlatformOrganizationDetail> {
    const dto = assertValid(subscriptionAssignmentSchema, body);
    if (!z.uuid().safeParse(organizationId).success) {
      throw notFound();
    }
    const [organization, plan] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }),
      this.prisma.plan.findUnique({ where: { id: dto.planId } }),
    ]);
    if (!organization) {
      throw notFound();
    }
    if (!plan || !plan.isActive) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Request validation failed',
        [{ field: 'planId', message: 'Choose an active plan' }],
      );
    }
    const now = new Date();
    const trialDays = dto.status === 'TRIALING' ? Math.max(plan.trialDays, 1) : null;
    const periodEnd = addInterval(now, plan.billingInterval, trialDays);

    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.subscription.findMany({
        where: { organizationId, status: { in: [...CURRENT_SUBSCRIPTION] } },
        select: { id: true, status: true, plan: { select: { code: true } } },
      });
      await tx.subscription.updateMany({
        where: { organizationId, status: { in: [...CURRENT_SUBSCRIPTION] } },
        data: { status: 'CANCELED', canceledAt: now },
      });
      const created = await tx.subscription.create({
        data: {
          organizationId,
          planId: plan.id,
          status: dto.status,
          priceMinor: plan.priceMinor,
          currency: plan.currency,
          billingInterval: plan.billingInterval,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          trialEndsAt: dto.status === 'TRIALING' ? periodEnd : null,
        },
        select: { id: true },
      });
      await this.audit.record(
        {
          action: AuditAction.PlatformSubscriptionAssigned,
          actorUserId: auth.user.id,
          organizationId,
          entityType: 'subscription',
          entityId: created.id,
          changes: {
            plan: plan.code,
            status: dto.status,
            priceMinor: plan.priceMinor,
            replaced: previous.map((entry) => ({
              id: entry.id,
              plan: entry.plan.code,
              status: entry.status,
            })),
            reason: dto.reason,
          },
          meta,
        },
        tx,
      );
    });
    return this.organizationDetail(auth, organizationId);
  }

  async plans(): Promise<Plan[]> {
    const rows = await this.prisma.plan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { priceMinor: 'asc' }, { code: 'asc' }],
      include: {
        _count: {
          select: { subscriptions: { where: { status: { in: [...CURRENT_SUBSCRIPTION] } } } },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      priceMinor: row.priceMinor,
      currency: row.currency,
      billingInterval: row.billingInterval,
      maxBranches: row.maxBranches,
      maxProducts: row.maxProducts,
      maxRiders: row.maxRiders,
      trialDays: row.trialDays,
      isActive: row.isActive,
      activeSubscriptions: row._count.subscriptions,
    }));
  }

  async createPlan(auth: AuthContext, body: unknown, meta: RequestMeta): Promise<Plan> {
    const dto = assertValid(createPlanRequestSchema, body);
    const existing = await this.prisma.plan.findUnique({
      where: { code: dto.code },
      select: { id: true },
    });
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'A plan with this code already exists',
        [{ field: 'code', message: 'A plan with this code already exists' }],
      );
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          priceMinor: dto.priceMinor,
          billingInterval: dto.billingInterval,
          maxBranches: dto.maxBranches ?? null,
          maxProducts: dto.maxProducts ?? null,
          maxRiders: dto.maxRiders ?? null,
          trialDays: dto.trialDays,
        },
      });
      await this.audit.record(
        {
          action: AuditAction.PlatformPlanCreated,
          actorUserId: auth.user.id,
          entityType: 'plan',
          entityId: plan.id,
          changes: {
            code: plan.code,
            priceMinor: plan.priceMinor,
            billingInterval: plan.billingInterval,
          },
          meta,
        },
        tx,
      );
      return plan;
    });
    const plans = await this.plans();
    const result = plans.find((plan) => plan.id === created.id);
    if (!result) {
      throw notFound();
    }
    return result;
  }

  async subscriptionOverview(): Promise<SubscriptionOverview> {
    const now = new Date();
    const [byStatus, current, trialsEnding, organizations, withSubscription, pastDue] =
      await Promise.all([
        this.prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.subscription.findMany({
          where: { status: { in: ['ACTIVE', 'TRIALING'] } },
          select: {
            status: true,
            priceMinor: true,
            billingInterval: true,
            plan: { select: { id: true, name: true } },
          },
        }),
        this.prisma.subscription.count({
          where: {
            status: 'TRIALING',
            trialEndsAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY_MS) },
          },
        }),
        this.prisma.organization.count({ where: { status: { not: 'CLOSED' } } }),
        this.prisma.organization.count({
          where: {
            status: { not: 'CLOSED' },
            subscriptions: { some: { status: { in: [...CURRENT_SUBSCRIPTION] } } },
          },
        }),
        this.prisma.subscription.findMany({
          where: { status: 'PAST_DUE' },
          orderBy: { currentPeriodEnd: 'asc' },
          take: 50,
          select: {
            currentPeriodEnd: true,
            organization: { select: { id: true, name: true } },
            plan: { select: { name: true } },
          },
        }),
      ]);
    const plans = new Map<
      string,
      { planId: string; planName: string; active: number; trialing: number }
    >();
    let monthly = 0;
    for (const row of current) {
      const entry = plans.get(row.plan.id) ?? {
        planId: row.plan.id,
        planName: row.plan.name,
        active: 0,
        trialing: 0,
      };
      if (row.status === 'ACTIVE') {
        entry.active += 1;
        monthly +=
          row.billingInterval === 'YEARLY' ? Math.round(row.priceMinor / 12) : row.priceMinor;
      } else {
        entry.trialing += 1;
      }
      plans.set(row.plan.id, entry);
    }
    const counts = new Map(byStatus.map((row) => [row.status, row._count._all]));
    return {
      byStatus: {
        TRIALING: counts.get('TRIALING') ?? 0,
        ACTIVE: counts.get('ACTIVE') ?? 0,
        PAST_DUE: counts.get('PAST_DUE') ?? 0,
        CANCELED: counts.get('CANCELED') ?? 0,
        EXPIRED: counts.get('EXPIRED') ?? 0,
      },
      byPlan: [...plans.values()].sort((a, b) => a.planName.localeCompare(b.planName)),
      monthlyRecurringListPriceMinor: monthly,
      trialsEndingIn7Days: trialsEnding,
      restaurantsWithoutSubscription: organizations - withSubscription,
      pastDue: pastDue.map((row) => ({
        organizationId: row.organization.id,
        organizationName: row.organization.name,
        planName: row.plan.name,
        currentPeriodEnd: row.currentPeriodEnd.toISOString(),
      })),
    };
  }

  async auditLog(auth: AuthContext, rawQuery: unknown): Promise<Paginated<AuditEntry>> {
    const query = assertValid(auditQuerySchema, rawQuery);
    const where: Prisma.AuditLogWhereInput = {
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      ...(query.action ? { action: { startsWith: query.action } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: auditSelect,
      }),
    ]);
    const includeIp = auth.user.platformRole === PlatformRole.SUPER_ADMIN;
    return {
      items: rows.map((row) => this.toAudit(row, includeIp)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async health(): Promise<PlatformHealth> {
    const [database, pending, failed, oldest, lastHour, stale, statuses] = await Promise.all([
      this.databaseHealth.check(),
      this.prisma.notification.count({ where: { status: 'PENDING' } }),
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count FROM notifications
        WHERE status = 'FAILED' AND updated_at >= now() - interval '24 hours'`,
      this.prisma.$queryRaw<{ minutes: number | null }[]>`
        SELECT floor(extract(epoch FROM now() - min(created_at)) / 60)::int AS minutes
        FROM notifications WHERE status = 'PENDING'`,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count FROM orders WHERE placed_at >= now() - interval '1 hour'`,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count FROM orders
        WHERE status = 'PENDING' AND placed_at < now() - interval '15 minutes'`,
      this.prisma.organization.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const restaurants = new Map(statuses.map((row) => [row.status, row._count._all]));
    return {
      database,
      uptimeSeconds: Math.floor(process.uptime()),
      notifications: {
        pending,
        failedLast24Hours: Number(failed[0]?.count ?? 0),
        oldestPendingMinutes: oldest[0]?.minutes ?? null,
      },
      orders: {
        placedLastHour: Number(lastHour[0]?.count ?? 0),
        pendingOlderThan15Minutes: Number(stale[0]?.count ?? 0),
      },
      liveConnections: this.orderEvents.connectionCount,
      restaurants: {
        ACTIVE: restaurants.get('ACTIVE') ?? 0,
        SUSPENDED: restaurants.get('SUSPENDED') ?? 0,
        CLOSED: restaurants.get('CLOSED') ?? 0,
      },
      checkedAt: new Date().toISOString(),
    };
  }

  async exportOrganizations(
    auth: AuthContext,
    rawQuery: unknown,
    meta: RequestMeta,
  ): Promise<string> {
    const query = assertValid(
      platformOrganizationQuerySchema.omit({ page: true, pageSize: true }),
      rawQuery,
    );
    const where = this.organizationWhere(query.search, query.status);
    const total = await this.prisma.organization.count({ where });
    if (total > EXPORT_LIMIT) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        `Narrow the search to export at most ${EXPORT_LIMIT} restaurants`,
      );
    }
    const since = new Date(Date.now() - 30 * DAY_MS);
    const rows = await this.prisma.organization.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: this.organizationListSelect(since),
    });
    const items = rows.map((row) => this.toListItem(row));
    await this.audit.record({
      action: AuditAction.PlatformOrganizationsExported,
      actorUserId: auth.user.id,
      entityType: 'organization',
      changes: { search: query.search ?? null, status: query.status ?? null, rows: items.length },
      meta,
    });
    return toCsv([
      [
        'Name',
        'Slug',
        'Status',
        'Created',
        'Setup completed',
        'Owner email',
        'Branches',
        'Orders (30 days)',
        'Plan',
        'Subscription status',
      ],
      ...items.map((item) => [
        item.name,
        item.slug,
        item.status,
        item.createdAt.slice(0, 10),
        item.onboardingCompletedAt?.slice(0, 10) ?? null,
        item.owner?.email ?? null,
        item.branchCount,
        item.ordersLast30Days,
        item.subscription?.planName ?? null,
        item.subscription?.status ?? null,
      ]),
    ]);
  }
}
