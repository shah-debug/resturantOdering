import { randomUUID } from 'node:crypto';
import {
  addOnGroupSchema,
  apiErrorResponseSchema,
  auditPageSchema,
  branchSchema,
  categorySchema,
  checkoutQuoteSchema,
  placedOrderSchema,
  planListSchema,
  planSchema,
  platformHealthSchema,
  platformOrganizationDetailSchema,
  platformOrganizationPageSchema,
  productDetailSchema,
  salesReportSchema,
  subscriptionOverviewSchema,
} from '@app/contracts';
import request from 'supertest';
import { localDateOf } from '../../src/common/time/zoned-dates';
import {
  addMember,
  API,
  type Client,
  createHarness,
  type Harness,
  ORIGIN,
  registerUser,
} from '../support/auth-harness';

const ALL_DAY = [1, 2, 3, 4, 5, 6, 7].flatMap((dayOfWeek) => [
  { dayOfWeek, opensAt: '00:00', closesAt: '12:00' },
  { dayOfWeek, opensAt: '12:00', closesAt: '00:00' },
]);

interface Restaurant {
  id: string;
  slug: string;
  name: string;
  branchIds: string[];
  karahiId: string;
  halfId: string;
  naanId: string;
}

function code(body: unknown): string | undefined {
  return apiErrorResponseSchema.safeParse(body).data?.code;
}

describe('reports and platform administration (in-memory Postgres)', () => {
  let harness: Harness;
  let owner: Client;
  let otherOwner: Client;
  let kitchen: Client;
  let branchManager: Client;
  let support: Client;
  let superAdmin: Client;
  let superAdminId: string;
  let karahi: Restaurant;
  let other: Restaurant;
  const orders: Record<string, string> = {};

  beforeAll(async () => {
    harness = await createHarness();
    ({ client: owner } = await registerUser(harness, 'report-owner'));
    ({ client: otherOwner } = await registerUser(harness, 'report-other'));
    const supportUser = await registerUser(harness, 'platform-support');
    support = supportUser.client;
    const adminUser = await registerUser(harness, 'platform-admin');
    superAdmin = adminUser.client;
    await harness.prisma.user.update({
      where: { email: supportUser.email },
      data: { platformRole: 'SUPPORT' },
    });
    const admin = await harness.prisma.user.update({
      where: { email: adminUser.email },
      data: { platformRole: 'SUPER_ADMIN' },
    });
    superAdminId = admin.id;

    karahi = await createRestaurant(owner, 'karahi-reports', 'Karahi Reports', 2);
    other = await createRestaurant(otherOwner, 'other-reports', 'Other Reports', 1);
    ({ client: kitchen } = await addMember(
      harness,
      owner,
      karahi.id,
      'KITCHEN_STAFF',
      'rep-kitchen',
    ));
    const scoped = await addMember(harness, owner, karahi.id, 'MANAGER', 'rep-branch');
    branchManager = scoped.client;
    await harness.prisma.membership.update({
      where: { id: scoped.membershipId },
      data: { branchId: karahi.branchIds[1] },
    });

    orders.lateNight = await order(karahi, 'DELIVERY', 0, '2026-10-30T19:30:00Z', 'DELIVERED');
    orders.beforeMidnight = await order(karahi, 'PICKUP', 0, '2026-10-30T18:59:00Z', 'COMPLETED');
    orders.cancelled = await order(karahi, 'DELIVERY', 0, '2026-10-31T10:00:00Z', 'CANCELLED');
    orders.rejected = await order(karahi, 'DELIVERY', 0, '2026-10-31T11:00:00Z', 'REJECTED');
    orders.pending = await order(karahi, 'DELIVERY', 0, '2026-10-31T12:00:00Z', 'PENDING');
    orders.otherBranch = await order(karahi, 'DELIVERY', 1, '2026-10-31T13:00:00Z', 'DELIVERED');
    orders.refunded = await order(karahi, 'DELIVERY', 0, '2026-10-31T14:00:00Z', 'DELIVERED');
    orders.nextDay = await order(karahi, 'DELIVERY', 0, '2026-10-31T19:00:00Z', 'DELIVERED');
    orders.foreign = await order(other, 'DELIVERY', 0, '2026-10-31T10:00:00Z', 'DELIVERED');
    await harness.prisma.payment.updateMany({
      where: { orderId: orders.refunded },
      data: { status: 'PARTIALLY_REFUNDED', refundedAmountMinor: 50_000, refundedAt: new Date() },
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  async function createRestaurant(
    client: Client,
    slug: string,
    name: string,
    branches: number,
  ): Promise<Restaurant> {
    const id = (
      (await client.post('/organizations', { name, slug }).expect(201)).body as { id: string }
    ).id;
    const base = `/organizations/${id}`;
    await client
      .patch(base, {
        description: 'Charcoal karahi and fresh naan, cooked to order.',
        contactPhone: '+923111111111',
      })
      .expect(200);
    const branchIds: string[] = [];
    for (let index = 0; index < branches; index += 1) {
      const branch = branchSchema.parse(
        (
          await client
            .post(`${base}/branches`, {
              name: index === 0 ? 'Gulberg' : 'DHA',
              phone: '+924235000000',
              addressLine: '12 Main Boulevard',
              area: 'Gulberg III',
              city: 'Lahore',
            })
            .expect(201)
        ).body,
      );
      await client
        .put(`${base}/branches/${branch.id}/opening-hours`, { intervals: ALL_DAY })
        .expect(200);
      await client
        .put(`${base}/branches/${branch.id}/fulfillment`, {
          deliveryEnabled: true,
          pickupEnabled: true,
          preparationMinutes: 20,
          delivery: { feeMinor: 15_000, minimumOrderMinor: 0, estimatedMinutes: 40 },
        })
        .expect(200);
      branchIds.push(branch.id);
    }
    const menu = `${base}/menu`;
    const category = categorySchema.parse(
      (await client.post(`${menu}/categories`, { name: 'Karahi' }).expect(201)).body,
    ).id;
    const bread = addOnGroupSchema.parse(
      (
        await client
          .post(`${menu}/add-on-groups`, {
            name: 'Bread',
            minSelect: 1,
            maxSelect: 1,
            addOns: [{ name: 'Naan', priceMinor: 5_000, isAvailable: true }],
          })
          .expect(201)
      ).body,
    );
    const product = productDetailSchema.parse(
      (
        await client
          .post(`${menu}/products`, {
            categoryId: category,
            name: 'Chicken Karahi',
            status: 'PUBLISHED',
            isAvailable: true,
            variants: [{ name: 'Half', priceMinor: 145_000, isAvailable: true, isDefault: true }],
            addOnGroupIds: [bread.id],
          })
          .expect(201)
      ).body,
    );
    await client.post(`${base}/onboarding/complete`).expect(200);
    return {
      id,
      slug,
      name,
      branchIds,
      karahiId: product.id,
      halfId: product.variants[0]?.id ?? '',
      naanId: bread.addOns[0]?.id ?? '',
    };
  }

  async function order(
    restaurant: Restaurant,
    type: 'DELIVERY' | 'PICKUP',
    branch: number,
    placedAt: string,
    status: 'PENDING' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED' | 'REJECTED',
  ): Promise<string> {
    const body = {
      branchId: restaurant.branchIds[branch],
      fulfillment:
        type === 'PICKUP'
          ? { type: 'PICKUP' }
          : {
              type: 'DELIVERY',
              address: { addressLine: '45 Canal View Road', area: 'Model Town', city: 'Lahore' },
            },
      paymentMethod: 'CASH',
      items: [
        {
          productId: restaurant.karahiId,
          variantId: restaurant.halfId,
          addOnIds: [restaurant.naanId],
          quantity: 1,
        },
      ],
    };
    const post = (path: string, payload: object, headers: Record<string, string> = {}) => {
      let req = request(harness.app.getHttpServer())
        .post(`${API}/storefront/restaurants/${restaurant.slug}${path}`)
        .set('Origin', ORIGIN);
      for (const [name, value] of Object.entries(headers)) {
        req = req.set(name, value);
      }
      return req.send(payload);
    };
    const quote = checkoutQuoteSchema.parse((await post('/checkout/quote', body).expect(200)).body);
    const placed = placedOrderSchema.parse(
      (
        await post(
          '/orders',
          {
            ...body,
            customer: { name: 'Secret Customer', phone: '+923007654321' },
            expectedTotalMinor: quote.totals?.totalMinor ?? 0,
          },
          { 'Idempotency-Key': randomUUID() },
        ).expect(201)
      ).body,
    );
    const client = restaurant.id === karahi.id ? owner : otherOwner;
    const path = `/organizations/${restaurant.id}/orders/${placed.orderId}`;
    const steps: [string, string, string?][] =
      status === 'PENDING'
        ? []
        : status === 'CANCELLED'
          ? [['PENDING', 'CANCELLED', 'Customer called to cancel']]
          : status === 'REJECTED'
            ? [['PENDING', 'REJECTED', 'Kitchen closed early']]
            : [
                ['PENDING', 'CONFIRMED'],
                ['CONFIRMED', 'PREPARING'],
                ['PREPARING', 'READY'],
              ];
    for (const [expectedStatus, to, reason] of steps) {
      await client
        .post(`${path}/transitions`, { to, expectedStatus, ...(reason ? { reason } : {}) })
        .expect(200);
    }
    if (status === 'DELIVERED') {
      const rider = await harness.prisma.rider.create({
        data: {
          organizationId: restaurant.id,
          branchId: restaurant.branchIds[branch] ?? null,
          fullName: 'Rider',
          phone: `+92300${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
          availability: 'AVAILABLE',
        },
      });
      await client.put(`${path}/rider`, { riderId: rider.id, expectedRiderId: null }).expect(200);
      await client
        .post(`${path}/transitions`, { to: 'OUT_FOR_DELIVERY', expectedStatus: 'READY' })
        .expect(200);
      await client
        .post(`${path}/transitions`, { to: 'DELIVERED', expectedStatus: 'OUT_FOR_DELIVERY' })
        .expect(200);
    }
    if (status === 'COMPLETED') {
      await client
        .post(`${path}/transitions`, { to: 'COMPLETED', expectedStatus: 'READY' })
        .expect(200);
    }
    await harness.prisma.order.update({
      where: { id: placed.orderId },
      data: { placedAt: new Date(placedAt) },
    });
    return placed.orderId;
  }

  function report(client: Client, restaurant: Restaurant, query: string) {
    return client.get(`/organizations/${restaurant.id}/reports/sales?${query}`);
  }

  describe('sales report', () => {
    it('uses the restaurant’s local day and treats cancelled, rejected and refunded orders correctly', async () => {
      const body = salesReportSchema.parse(
        (await report(owner, karahi, 'from=2026-10-31&to=2026-10-31').expect(200)).body,
      );
      expect(body.range).toEqual({
        from: '2026-10-31',
        to: '2026-10-31',
        timezone: 'Asia/Karachi',
        startsAt: '2026-10-30T19:00:00.000Z',
        endsAt: '2026-10-31T19:00:00.000Z',
      });
      expect(body.orders).toEqual({
        placed: 6,
        completed: 3,
        cancelled: 1,
        rejected: 1,
        inProgress: 1,
      });
      expect(body.sales).toEqual({
        grossOrderValueMinor: 450_000,
        discountsMinor: 0,
        deliveryChargesMinor: 45_000,
        taxMinor: 0,
        orderTotalsMinor: 495_000,
        refundsMinor: 50_000,
        estimatedNetSalesMinor: 400_000,
        averageOrderValueMinor: 165_000,
      });
      expect(body.byType).toEqual([{ type: 'DELIVERY', completed: 3, totalMinor: 495_000 }]);
      expect(body.byPaymentMethod).toEqual([{ method: 'CASH', completed: 3, totalMinor: 495_000 }]);
      expect(body.popularItems).toEqual([
        { productId: karahi.karahiId, name: 'Chicken Karahi', quantity: 3, salesMinor: 450_000 },
      ]);
      expect(body.daily).toEqual([
        { date: '2026-10-31', placed: 6, completed: 3, cancelled: 2, orderTotalsMinor: 495_000 },
      ]);
    });

    it('puts orders on either side of local midnight on the right day', async () => {
      const body = salesReportSchema.parse(
        (await report(owner, karahi, 'from=2026-10-30&to=2026-11-01').expect(200)).body,
      );
      expect(body.daily.map((day) => [day.date, day.placed, day.completed])).toEqual([
        ['2026-10-30', 1, 1],
        ['2026-10-31', 6, 3],
        ['2026-11-01', 1, 1],
      ]);
      const previous = salesReportSchema.parse(
        (await report(owner, karahi, 'from=2026-10-30&to=2026-10-30').expect(200)).body,
      );
      expect(previous.orders).toMatchObject({ placed: 1, completed: 1 });
      expect(previous.byType).toEqual([{ type: 'PICKUP', completed: 1, totalMinor: 150_000 }]);
      expect(previous.sales.deliveryChargesMinor).toBe(0);
    });

    it('returns empty, not invented, numbers for a quiet period', async () => {
      const body = salesReportSchema.parse(
        (await report(owner, karahi, 'from=2026-01-01&to=2026-01-03').expect(200)).body,
      );
      expect(body.orders.placed).toBe(0);
      expect(body.sales.averageOrderValueMinor).toBeNull();
      expect(body.popularItems).toEqual([]);
      expect(body.daily).toHaveLength(3);
      expect(body.daily.every((day) => day.placed === 0 && day.orderTotalsMinor === 0)).toBe(true);
    });

    it('records payments by payment date', async () => {
      const today = localDateOf(new Date(), 'Asia/Karachi');
      const body = salesReportSchema.parse(
        (await report(owner, karahi, `from=${today}&to=${today}`).expect(200)).body,
      );
      expect(body.payments).toEqual({
        recordedMinor: 4 * 165_000 + 150_000 - 50_000,
        refundedMinor: 50_000,
        count: 5,
      });
    });

    it('scopes to a branch and forces branch-limited staff to their own branch', async () => {
      const branchTwo = salesReportSchema.parse(
        (
          await report(
            owner,
            karahi,
            `from=2026-10-31&to=2026-10-31&branchId=${karahi.branchIds[1]}`,
          ).expect(200)
        ).body,
      );
      expect(branchTwo.orders).toMatchObject({ placed: 1, completed: 1 });
      const forced = salesReportSchema.parse(
        (
          await report(
            branchManager,
            karahi,
            `from=2026-10-31&to=2026-10-31&branchId=${karahi.branchIds[0]}`,
          ).expect(200)
        ).body,
      );
      expect(forced.orders).toMatchObject({ placed: 1, completed: 1 });
      await report(
        owner,
        karahi,
        `from=2026-10-31&to=2026-10-31&branchId=${other.branchIds[0]}`,
      ).expect(400);
    });

    it('keeps restaurants apart and limits reports to permitted roles', async () => {
      const otherReport = salesReportSchema.parse(
        (await report(otherOwner, other, 'from=2026-10-31&to=2026-10-31').expect(200)).body,
      );
      expect(otherReport.orders).toMatchObject({ placed: 1, completed: 1 });
      await report(otherOwner, karahi, 'from=2026-10-31&to=2026-10-31').expect(404);
      await report(kitchen, karahi, 'from=2026-10-31&to=2026-10-31').expect(403);
      await report(support, karahi, 'from=2026-10-31&to=2026-10-31').expect(200);
    });

    it('validates the date range', async () => {
      await report(owner, karahi, 'from=2026-10-31&to=2026-10-01').expect(400);
      await report(owner, karahi, 'from=2025-01-01&to=2026-10-31').expect(400);
      await report(owner, karahi, 'from=31-10-2026&to=2026-10-31').expect(400);
      await report(owner, karahi, '').expect(400);
    });

    it('exports orders without customer details and audits the export', async () => {
      const response = await owner
        .get(`/organizations/${karahi.id}/reports/orders.csv?from=2026-10-31&to=2026-10-31`)
        .expect(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain(
        'orders-2026-10-31-to-2026-10-31.csv',
      );
      const lines = response.text.trim().split('\r\n');
      expect(lines).toHaveLength(7);
      expect(lines[0]).toContain('Order number,Placed (local time),Local date,Branch');
      expect(response.text).not.toContain('Secret Customer');
      expect(response.text).not.toContain('+923007654321');
      expect(response.text).not.toContain('Canal View');
      const audit = await harness.prisma.auditLog.findFirstOrThrow({
        where: { organizationId: karahi.id, action: 'report.orders_exported' },
      });
      expect(audit.changes).toMatchObject({ from: '2026-10-31', to: '2026-10-31', rows: 6 });
      await kitchen
        .get(`/organizations/${karahi.id}/reports/orders.csv?from=2026-10-31&to=2026-10-31`)
        .expect(403);
    });
  });

  describe('platform administration', () => {
    it('refuses restaurant users on every platform endpoint', async () => {
      for (const path of [
        '/platform/organizations',
        `/platform/organizations/${karahi.id}`,
        '/platform/organizations/export.csv',
        '/platform/plans',
        '/platform/subscriptions/overview',
        '/platform/audit-logs',
        '/platform/health',
      ]) {
        const response = await owner.get(path).expect(403);
        expect(code(response.body)).toBe('FORBIDDEN');
      }
      await owner
        .patch(`/platform/organizations/${karahi.id}/status`, {
          status: 'SUSPENDED',
          expectedStatus: 'ACTIVE',
          reason: 'Not allowed',
        })
        .expect(403);
      await request(harness.app.getHttpServer()).get(`${API}/platform/organizations`).expect(401);
    });

    it('gives support read-only access', async () => {
      await support.get('/platform/organizations').expect(200);
      await support.get(`/platform/organizations/${karahi.id}`).expect(200);
      await support.get('/platform/health').expect(200);
      await support.get('/platform/organizations/export.csv').expect(403);
      await support
        .patch(`/platform/organizations/${karahi.id}/status`, {
          status: 'SUSPENDED',
          expectedStatus: 'ACTIVE',
          reason: 'Support should not do this',
        })
        .expect(403);
      await support.post('/platform/plans', {}).expect(403);
      await support.put(`/platform/organizations/${karahi.id}/subscription`, {}).expect(403);
    });

    it('lists restaurants with search, status filter and pagination', async () => {
      const all = platformOrganizationPageSchema.parse(
        (await support.get('/platform/organizations?pageSize=1&page=2').expect(200)).body,
      );
      expect(all).toMatchObject({ page: 2, pageSize: 1, total: 2 });
      const searched = platformOrganizationPageSchema.parse(
        (await support.get('/platform/organizations?search=karahi').expect(200)).body,
      );
      expect(searched.items.map((item) => item.slug)).toEqual(['karahi-reports']);
      expect(searched.items[0]).toMatchObject({
        status: 'ACTIVE',
        branchCount: 2,
        owner: { fullName: 'report-owner user' },
        subscription: null,
      });
      const byOwner = platformOrganizationPageSchema.parse(
        (await support.get('/platform/organizations?search=report-other').expect(200)).body,
      );
      expect(byOwner.items.map((item) => item.slug)).toEqual(['other-reports']);
      await support.get('/platform/organizations?status=NOPE').expect(400);
    });

    it('suspends and reactivates a restaurant with a reason and an audit record', async () => {
      const path = `/platform/organizations/${other.id}/status`;
      await superAdmin.patch(path, { status: 'SUSPENDED', expectedStatus: 'ACTIVE' }).expect(400);
      await superAdmin
        .patch(path, { status: 'SUSPENDED', expectedStatus: 'SUSPENDED', reason: 'Stale status' })
        .expect(409);
      const suspended = platformOrganizationDetailSchema.parse(
        (
          await superAdmin
            .patch(path, {
              status: 'SUSPENDED',
              expectedStatus: 'ACTIVE',
              reason: 'Unpaid invoices',
            })
            .expect(200)
        ).body,
      );
      expect(suspended.status).toBe('SUSPENDED');
      await otherOwner.get(`/organizations/${other.id}/orders`).expect(403);
      await request(harness.app.getHttpServer())
        .get(`${API}/storefront/restaurants/${other.slug}`)
        .expect(404);

      await superAdmin
        .patch(path, { status: 'ACTIVE', expectedStatus: 'SUSPENDED', reason: 'Invoices paid' })
        .expect(200);
      await otherOwner.get(`/organizations/${other.id}/orders`).expect(200);

      const audits = await harness.prisma.auditLog.findMany({
        where: { organizationId: other.id, action: 'platform.organization_status_changed' },
        orderBy: { createdAt: 'asc' },
      });
      expect(audits).toHaveLength(2);
      expect(audits[0]).toMatchObject({
        actorUserId: superAdminId,
        entityType: 'organization',
        entityId: other.id,
        changes: { from: 'ACTIVE', to: 'SUSPENDED', reason: 'Unpaid invoices' },
      });
      expect(audits[0]?.ipAddress).not.toBeNull();
    });

    it('creates plans and assigns subscriptions, replacing the current one', async () => {
      const created = planSchema.parse(
        (
          await superAdmin
            .post('/platform/plans', {
              code: 'growth',
              name: 'Growth',
              priceMinor: 500_000,
              billingInterval: 'MONTHLY',
              trialDays: 14,
              maxBranches: 3,
            })
            .expect(201)
        ).body,
      );
      await superAdmin
        .post('/platform/plans', {
          code: 'growth',
          name: 'Copy',
          priceMinor: 1,
          billingInterval: 'MONTHLY',
          trialDays: 0,
        })
        .expect(409);
      const yearly = planSchema.parse(
        (
          await superAdmin
            .post('/platform/plans', {
              code: 'yearly-pro',
              name: 'Yearly Pro',
              priceMinor: 6_000_000,
              billingInterval: 'YEARLY',
              trialDays: 0,
            })
            .expect(201)
        ).body,
      );
      const path = `/platform/organizations/${karahi.id}/subscription`;
      await superAdmin.put(path, { planId: created.id, status: 'TRIALING' }).expect(400);
      const trial = platformOrganizationDetailSchema.parse(
        (
          await superAdmin
            .put(path, { planId: created.id, status: 'TRIALING', reason: 'New signup trial' })
            .expect(200)
        ).body,
      );
      expect(trial.subscription).toMatchObject({ planCode: 'growth', status: 'TRIALING' });
      const active = platformOrganizationDetailSchema.parse(
        (
          await superAdmin
            .put(path, { planId: yearly.id, status: 'ACTIVE', reason: 'Paid for a year' })
            .expect(200)
        ).body,
      );
      expect(active.subscription).toMatchObject({
        planCode: 'yearly-pro',
        status: 'ACTIVE',
        priceMinor: 6_000_000,
      });
      expect(active.subscriptions.map((entry) => entry.status)).toEqual(['ACTIVE', 'CANCELED']);
      expect(
        await harness.prisma.subscription.count({
          where: { organizationId: karahi.id, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] } },
        }),
      ).toBe(1);

      const plans = planListSchema.parse((await support.get('/platform/plans').expect(200)).body);
      expect(plans.find((plan) => plan.code === 'yearly-pro')?.activeSubscriptions).toBe(1);
      const overview = subscriptionOverviewSchema.parse(
        (await support.get('/platform/subscriptions/overview').expect(200)).body,
      );
      expect(overview).toMatchObject({
        byStatus: { ACTIVE: 1, CANCELED: 1, TRIALING: 0 },
        monthlyRecurringListPriceMinor: 500_000,
        restaurantsWithoutSubscription: 1,
      });

      const audit = await harness.prisma.auditLog.findMany({
        where: { action: { in: ['platform.plan_created', 'platform.subscription_assigned'] } },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((entry) => entry.action)).toEqual([
        'platform.plan_created',
        'platform.plan_created',
        'platform.subscription_assigned',
        'platform.subscription_assigned',
      ]);
      expect(audit.every((entry) => entry.actorUserId === superAdminId)).toBe(true);
      expect(audit[3]?.changes).toMatchObject({
        plan: 'yearly-pro',
        reason: 'Paid for a year',
        replaced: [{ plan: 'growth', status: 'TRIALING' }],
      });
    });

    it('does not reopen a closed restaurant', async () => {
      const closing = await createRestaurant(otherOwner, 'closing-down', 'Closing Down', 1);
      const path = `/platform/organizations/${closing.id}/status`;
      await superAdmin
        .patch(path, { status: 'CLOSED', expectedStatus: 'ACTIVE', reason: 'Owner asked to close' })
        .expect(200);
      const reopen = await superAdmin
        .patch(path, { status: 'ACTIVE', expectedStatus: 'CLOSED', reason: 'Try to reopen' })
        .expect(409);
      expect(apiErrorResponseSchema.parse(reopen.body).message).toContain('cannot be reopened');
    });

    it('shows the audit trail, hiding IP addresses from support', async () => {
      const forSupport = auditPageSchema.parse(
        (
          await support
            .get(`/platform/audit-logs?organizationId=${other.id}&action=platform.`)
            .expect(200)
        ).body,
      );
      expect(forSupport.items.length).toBeGreaterThanOrEqual(2);
      expect(forSupport.items.every((item) => item.action.startsWith('platform.'))).toBe(true);
      expect(forSupport.items.every((item) => item.ipAddress === null)).toBe(true);
      expect(forSupport.items[0]?.actor?.email).toContain('platform-admin');
      const forAdmin = auditPageSchema.parse(
        (
          await superAdmin
            .get(`/platform/audit-logs?organizationId=${other.id}&action=platform.`)
            .expect(200)
        ).body,
      );
      expect(forAdmin.items.some((item) => item.ipAddress !== null)).toBe(true);
      const detail = platformOrganizationDetailSchema.parse(
        (await support.get(`/platform/organizations/${other.id}`).expect(200)).body,
      );
      expect(
        detail.recentAudit.some((entry) => entry.action === 'platform.organization_status_changed'),
      ).toBe(true);
    });

    it('exports restaurants for super admins and audits it', async () => {
      const response = await superAdmin
        .get('/platform/organizations/export.csv?status=ACTIVE')
        .expect(200);
      expect(response.text.split('\r\n')[0]).toContain('Name,Slug,Status');
      expect(response.text).toContain('karahi-reports');
      expect(response.text).not.toContain('closing-down');
      const audit = await harness.prisma.auditLog.findFirstOrThrow({
        where: { action: 'platform.organizations_exported' },
      });
      expect(audit).toMatchObject({ actorUserId: superAdminId, changes: { status: 'ACTIVE' } });
    });

    it('reports operational health from live data', async () => {
      await harness.prisma.order.update({
        where: { id: orders.pending },
        data: { placedAt: new Date('2020-01-01T00:00:00Z') },
      });
      const health = platformHealthSchema.parse(
        (await support.get('/platform/health').expect(200)).body,
      );
      expect(health.database.status).toBe('up');
      expect(health.restaurants).toEqual({ ACTIVE: 2, SUSPENDED: 0, CLOSED: 1 });
      expect(health.orders.pendingOlderThan15Minutes).toBeGreaterThanOrEqual(1);
      expect(health.liveConnections).toBe(0);
    });
  });
});
