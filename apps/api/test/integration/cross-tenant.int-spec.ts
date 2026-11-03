import { randomUUID } from 'node:crypto';
import {
  addOnGroupSchema,
  branchSchema,
  categorySchema,
  checkoutQuoteSchema,
  placedOrderSchema,
  planSchema,
  productDetailSchema,
  riderSchema,
} from '@app/contracts';
import request from 'supertest';
import { localDateOf } from '../../src/common/time/zoned-dates';
import {
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
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('receipt-image'),
]);
const DENIED_WRITE = [400, 403, 404, 409, 422];

interface Tenant {
  id: string;
  slug: string;
  branchId: string;
  categoryId: string;
  productId: string;
  variantId: string;
  groupId: string;
  addOnId: string;
  riderId: string;
  orderId: string;
  trackingToken: string;
}

describe('cross-tenant attacks on every major resource (in-memory Postgres)', () => {
  let harness: Harness;
  let attacker: Client;
  let victimOwner: Client;
  let admin: Client;
  let a: Tenant;
  let b: Tenant;
  let victimMembershipId: string;
  let victimInvoiceId: string;
  let victimPaymentId: string;
  let planId: string;

  beforeAll(async () => {
    harness = await createHarness();
    ({ client: attacker } = await registerUser(harness, 'xt-attacker'));
    ({ client: victimOwner } = await registerUser(harness, 'xt-victim'));
    const adminUser = await registerUser(harness, 'xt-admin');
    admin = adminUser.client;
    await harness.prisma.user.update({
      where: { email: adminUser.email },
      data: { platformRole: 'SUPER_ADMIN' },
    });

    a = await createTenant(attacker, `xt-a-${randomUUID().slice(0, 6)}`);
    b = await createTenant(victimOwner, `xt-b-${randomUUID().slice(0, 6)}`);

    const members = (await victimOwner.get(`/organizations/${b.id}/members`).expect(200)).body as {
      items: { membershipId: string }[];
    };
    victimMembershipId = members.items[0]?.membershipId ?? '';

    planId = planSchema.parse(
      (
        await admin
          .post('/platform/plans', {
            code: `xt-${randomUUID().slice(0, 6)}`,
            name: 'Cross tenant plan',
            priceMinor: 300_000,
            billingInterval: 'MONTHLY',
            trialDays: 14,
            graceDays: 7,
          })
          .expect(201)
      ).body,
    ).id;
    await admin
      .put(`/platform/organizations/${b.id}/subscription`, {
        planId,
        status: 'TRIALING',
        reason: 'Pilot restaurant',
      })
      .expect(200);
    const invoice = await harness.prisma.subscriptionInvoice.findFirstOrThrow({
      where: { organizationId: b.id, status: 'OPEN' },
    });
    victimInvoiceId = invoice.id;
    const payment = await request(harness.app.getHttpServer())
      .post(`${API}/organizations/${b.id}/billing/payments`)
      .set('Origin', ORIGIN)
      .set('Cookie', victimOwner.cookie ?? '')
      .field('invoiceId', invoice.id)
      .field('method', 'BANK_TRANSFER')
      .field('reference', `XT-${randomUUID().slice(0, 8)}`)
      .field('amountMinor', String(invoice.amountMinor))
      .field('paidOn', localDateOf(new Date(), 'Asia/Karachi'))
      .attach('evidence', PNG, { filename: 'receipt.png', contentType: 'image/png' })
      .expect(201);
    victimPaymentId = (payment.body as { id: string }).id;
  });

  afterAll(async () => {
    await harness.close();
  });

  async function createTenant(client: Client, slug: string): Promise<Tenant> {
    const id = (
      (await client.post('/organizations', { name: `${slug} kitchen`, slug }).expect(201)).body as {
        id: string;
      }
    ).id;
    const base = `/organizations/${id}`;
    await client
      .patch(base, { description: 'Charcoal karahi.', contactPhone: '+923111111111' })
      .expect(200);
    const branch = branchSchema.parse(
      (
        await client
          .post(`${base}/branches`, {
            name: 'Gulberg',
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
        deliveryEnabled: false,
        pickupEnabled: true,
        preparationMinutes: 20,
      })
      .expect(200);
    const menu = `${base}/menu`;
    const categoryId = categorySchema.parse(
      (await client.post(`${menu}/categories`, { name: 'Karahi' }).expect(201)).body,
    ).id;
    const group = addOnGroupSchema.parse(
      (
        await client
          .post(`${menu}/add-on-groups`, {
            name: 'Bread',
            minSelect: 0,
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
            categoryId,
            name: 'Chicken Karahi',
            status: 'PUBLISHED',
            isAvailable: true,
            variants: [{ name: 'Half', priceMinor: 145_000, isAvailable: true, isDefault: true }],
            addOnGroupIds: [group.id],
          })
          .expect(201)
      ).body,
    );
    const rider = riderSchema.parse(
      (
        await client
          .post(`${base}/riders`, {
            branchId: branch.id,
            fullName: 'Imran Rider',
            phone: '+923001112233',
            vehicleType: 'MOTORCYCLE',
          })
          .expect(201)
      ).body,
    );
    await client.post(`${base}/onboarding/complete`).expect(200);

    const variantId = product.variants[0]?.id ?? '';
    const addOnId = group.addOns[0]?.id ?? '';
    const body = {
      branchId: branch.id,
      fulfillment: { type: 'PICKUP' },
      paymentMethod: 'CASH',
      items: [{ productId: product.id, variantId, addOnIds: [addOnId], quantity: 1 }],
    };
    const quote = checkoutQuoteSchema.parse(
      (await storefrontPost(`/${slug}/checkout/quote`, body).expect(200)).body,
    );
    const placed = placedOrderSchema.parse(
      (
        await storefrontPost(
          `/${slug}/orders`,
          {
            ...body,
            customer: { name: 'Bilal Ahmed', phone: '+923009876543' },
            expectedTotalMinor: quote.totals?.totalMinor ?? 0,
          },
          { 'Idempotency-Key': randomUUID() },
        ).expect(201)
      ).body,
    );
    return {
      id,
      slug,
      branchId: branch.id,
      categoryId,
      productId: product.id,
      variantId,
      groupId: group.id,
      addOnId,
      riderId: rider.id,
      orderId: placed.orderId,
      trackingToken: placed.trackingToken,
    };
  }

  function storefrontPost(path: string, body: object, headers: Record<string, string> = {}) {
    let req = request(harness.app.getHttpServer())
      .post(`${API}/storefront/restaurants${path}`)
      .set('Origin', ORIGIN);
    for (const [name, value] of Object.entries(headers)) {
      req = req.set(name, value);
    }
    return req.send(body);
  }

  function storefrontGet(path: string, token: string) {
    return request(harness.app.getHttpServer())
      .get(`${API}/storefront/restaurants${path}`)
      .set('x-order-token', token);
  }

  async function victimSnapshot() {
    const prisma = harness.prisma;
    return {
      organization: await prisma.organization.findUniqueOrThrow({
        where: { id: b.id },
        select: { name: true, status: true, description: true },
      }),
      branches: await prisma.branch.findMany({
        where: { organizationId: b.id },
        select: { id: true, name: true, status: true },
        orderBy: { id: 'asc' },
      }),
      categories: await prisma.category.findMany({
        where: { organizationId: b.id },
        select: { id: true, name: true, archivedAt: true, sortOrder: true },
        orderBy: { id: 'asc' },
      }),
      products: await prisma.product.findMany({
        where: { organizationId: b.id },
        select: { id: true, name: true, archivedAt: true, status: true, imageKey: true },
        orderBy: { id: 'asc' },
      }),
      groups: await prisma.addOnGroup.findMany({
        where: { organizationId: b.id },
        select: { id: true, name: true, archivedAt: true },
        orderBy: { id: 'asc' },
      }),
      riders: await prisma.rider.findMany({
        where: { organizationId: b.id },
        select: { id: true, fullName: true, status: true, branchId: true },
        orderBy: { id: 'asc' },
      }),
      orders: await prisma.order.findMany({
        where: { organizationId: b.id },
        select: { id: true, status: true, riderId: true },
        orderBy: { id: 'asc' },
      }),
      customers: await prisma.customer.count({ where: { organizationId: b.id } }),
      memberships: await prisma.membership.findMany({
        where: { organizationId: b.id },
        select: { id: true, role: true, status: true },
        orderBy: { id: 'asc' },
      }),
      subscriptions: await prisma.subscription.findMany({
        where: { organizationId: b.id },
        select: { id: true, status: true, cancelAtPeriodEnd: true },
        orderBy: { id: 'asc' },
      }),
      payments: await prisma.subscriptionPayment.findMany({
        where: { organizationId: b.id },
        select: { id: true, status: true },
        orderBy: { id: 'asc' },
      }),
    };
  }

  it('hides every resource of another restaurant behind 404 on its own routes', async () => {
    const base = `/organizations/${b.id}`;
    const today = localDateOf(new Date(), 'Asia/Karachi');
    const reads = [
      base,
      `${base}/onboarding`,
      `${base}/branches`,
      `${base}/branches/${b.branchId}`,
      `${base}/menu/categories`,
      `${base}/menu/products`,
      `${base}/menu/products/${b.productId}`,
      `${base}/menu/add-on-groups`,
      `${base}/menu/add-on-groups/${b.groupId}`,
      `${base}/orders`,
      `${base}/orders/counts`,
      `${base}/orders/events`,
      `${base}/orders/${b.orderId}`,
      `${base}/riders`,
      `${base}/members`,
      `${base}/reports/sales?from=${today}&to=${today}`,
      `${base}/reports/orders.csv?from=${today}&to=${today}`,
      `${base}/subscription`,
      `${base}/billing`,
      `${base}/billing/payments/${victimPaymentId}/evidence`,
    ];
    for (const path of reads) {
      const response = await attacker.get(path);
      expect({ path, status: response.status }).toEqual({ path, status: 404 });
    }
    const writes = [
      () => attacker.patch(base, { name: 'Hijacked' }),
      () => attacker.post(`${base}/branches`, { name: 'Rogue', addressLine: 'x', city: 'Lahore' }),
      () => attacker.patch(`${base}/branches/${b.branchId}`, { name: 'Rogue' }),
      () => attacker.post(`${base}/menu/categories`, { name: 'Rogue' }),
      () => attacker.delete(`${base}/menu/categories/${b.categoryId}`),
      () => attacker.delete(`${base}/menu/products/${b.productId}`),
      () => attacker.delete(`${base}/menu/add-on-groups/${b.groupId}`),
      () =>
        attacker.post(`${base}/orders/${b.orderId}/transitions`, {
          to: 'CANCELLED',
          expectedStatus: 'PENDING',
          reason: 'Rogue cancel',
        }),
      () =>
        attacker.put(`${base}/orders/${b.orderId}/rider`, {
          riderId: null,
          expectedRiderId: null,
        }),
      () => attacker.patch(`${base}/riders/${b.riderId}`, { status: 'INACTIVE' }),
      () =>
        attacker.post(`${base}/members`, {
          email: 'rogue@example.com',
          fullName: 'Rogue',
          role: 'OWNER',
        }),
      () => attacker.delete(`${base}/members/${victimMembershipId}`),
      () => attacker.post(`${base}/onboarding/complete`),
    ];
    for (const write of writes) {
      const response = await write();
      expect(response.status).toBe(404);
    }
  });

  it('refuses child IDs of another restaurant smuggled through the attacker’s own routes', async () => {
    const before = await victimSnapshot();
    const base = `/organizations/${a.id}`;
    const menu = `${base}/menu`;
    const today = localDateOf(new Date(), 'Asia/Karachi');

    const reads = [
      `${base}/branches/${b.branchId}`,
      `${menu}/products/${b.productId}`,
      `${menu}/add-on-groups/${b.groupId}`,
      `${base}/orders/${b.orderId}`,
      `${base}/billing/payments/${victimPaymentId}/evidence`,
    ];
    for (const path of reads) {
      const response = await attacker.get(path);
      expect({ path, status: response.status }).toEqual({ path, status: 404 });
    }
    const sales = await attacker.get(
      `${base}/reports/sales?from=${today}&to=${today}&branchId=${b.branchId}`,
    );
    expect(DENIED_WRITE).toContain(sales.status);
    const riders = await attacker.get(`${base}/riders?branchId=${b.branchId}`).expect(200);
    expect(JSON.stringify(riders.body)).not.toContain(b.riderId);

    const product = {
      categoryId: b.categoryId,
      name: 'Smuggled',
      status: 'PUBLISHED',
      isAvailable: true,
      variants: [{ name: 'Full', priceMinor: 100_000, isAvailable: true, isDefault: true }],
      addOnGroupIds: [],
    };
    const writes = [
      () => attacker.patch(`${base}/branches/${b.branchId}`, { name: 'Rogue' }),
      () => attacker.put(`${base}/branches/${b.branchId}/opening-hours`, { intervals: [] }),
      () => attacker.patch(`${menu}/categories/${b.categoryId}`, { name: 'Rogue' }),
      () => attacker.delete(`${menu}/categories/${b.categoryId}`),
      () => attacker.put(`${menu}/categories/order`, { ids: [b.categoryId, a.categoryId] }),
      () =>
        attacker.put(`${menu}/categories/${b.categoryId}/products/order`, { ids: [b.productId] }),
      () => attacker.patch(`${menu}/products/${b.productId}`, { isAvailable: false }),
      () =>
        attacker.put(`${menu}/products/${b.productId}`, { ...product, categoryId: a.categoryId }),
      () => attacker.delete(`${menu}/products/${b.productId}`),
      () => attacker.delete(`${menu}/products/${b.productId}/image`),
      () => attacker.post(`${menu}/products`, product),
      () =>
        attacker.post(`${menu}/products`, {
          ...product,
          categoryId: a.categoryId,
          addOnGroupIds: [b.groupId],
        }),
      () =>
        attacker.put(`${menu}/add-on-groups/${b.groupId}`, {
          name: 'Rogue',
          minSelect: 0,
          maxSelect: 1,
          addOns: [{ id: b.addOnId, name: 'Rogue', priceMinor: 1, isAvailable: true }],
        }),
      () => attacker.delete(`${menu}/add-on-groups/${b.groupId}`),
      () =>
        attacker.post(`${base}/orders/${b.orderId}/transitions`, {
          to: 'CANCELLED',
          expectedStatus: 'PENDING',
          reason: 'Rogue cancel',
        }),
      () =>
        attacker.put(`${base}/orders/${b.orderId}/rider`, {
          riderId: a.riderId,
          expectedRiderId: null,
        }),
      () =>
        attacker.put(`${base}/orders/${a.orderId}/rider`, {
          riderId: b.riderId,
          expectedRiderId: null,
        }),
      () =>
        attacker.put(`${base}/riders/${b.riderId}`, {
          branchId: a.branchId,
          fullName: 'Rogue',
          phone: '+923009990000',
          vehicleType: 'CAR',
        }),
      () => attacker.patch(`${base}/riders/${b.riderId}`, { status: 'INACTIVE' }),
      () =>
        attacker.post(`${base}/riders`, {
          branchId: b.branchId,
          fullName: 'Rogue rider',
          phone: '+923007770000',
          vehicleType: 'CAR',
        }),
      () => attacker.patch(`${base}/members/${victimMembershipId}`, { role: 'MANAGER' }),
      () => attacker.delete(`${base}/members/${victimMembershipId}`),
      () =>
        request(harness.app.getHttpServer())
          .post(`${API}${base}/billing/payments`)
          .set('Origin', ORIGIN)
          .set('Cookie', attacker.cookie ?? '')
          .field('invoiceId', victimInvoiceId)
          .field('method', 'JAZZCASH')
          .field('reference', 'XT-SMUGGLED-1')
          .field('amountMinor', '300000')
          .field('paidOn', today),
    ];
    for (const write of writes) {
      const response = await write();
      expect(DENIED_WRITE).toContain(response.status);
    }
    expect(await victimSnapshot()).toEqual(before);
  });

  it('keeps tracking tokens bound to their own order and restaurant', async () => {
    await storefrontGet(`/${b.slug}/orders/${b.orderId}`, b.trackingToken).expect(200);
    await storefrontGet(`/${b.slug}/orders/${b.orderId}`, a.trackingToken).expect(404);
    await storefrontGet(`/${a.slug}/orders/${b.orderId}`, b.trackingToken).expect(404);
    await storefrontGet(`/${b.slug}/orders/${a.orderId}`, a.trackingToken).expect(404);
    await storefrontPost(
      `/${b.slug}/orders/${b.orderId}/cancel`,
      {},
      {
        'x-order-token': a.trackingToken,
      },
    ).expect(404);
    await storefrontPost(
      `/${a.slug}/orders/${b.orderId}/cancel`,
      {},
      {
        'x-order-token': b.trackingToken,
      },
    ).expect(404);
    const quote = await storefrontPost(`/${a.slug}/checkout/quote`, {
      branchId: b.branchId,
      fulfillment: { type: 'PICKUP' },
      paymentMethod: 'CASH',
      items: [{ productId: b.productId, variantId: b.variantId, addOnIds: [], quantity: 1 }],
    });
    expect(quote.status).not.toBe(500);
    expect(JSON.stringify(quote.body)).not.toContain('Chicken Karahi');
    const order = await harness.prisma.order.findUniqueOrThrow({ where: { id: b.orderId } });
    expect(order.status).toBe('PENDING');
  });

  it('keeps receipts out of the public media route', async () => {
    const payment = await harness.prisma.subscriptionPayment.findUniqueOrThrow({
      where: { id: victimPaymentId },
      select: { evidenceKey: true },
    });
    expect(payment.evidenceKey).toMatch(new RegExp(`^${b.id}/billing/`));
    await request(harness.app.getHttpServer())
      .get(`${API}/media/${payment.evidenceKey ?? ''}`)
      .expect(404);
    await request(harness.app.getHttpServer())
      .get(`${API}/media/${b.id}/..%2F..%2F.private/${payment.evidenceKey ?? ''}`)
      .expect(404);
  });

  it('refuses platform and billing administration to restaurant owners', async () => {
    const before = await victimSnapshot();
    const reads = [
      '/platform/organizations',
      `/platform/organizations/${b.id}`,
      '/platform/organizations/export.csv',
      '/platform/plans',
      '/platform/subscriptions/overview',
      '/platform/audit-logs',
      '/platform/health',
      '/platform/billing/payments',
      `/platform/billing/payments/${victimPaymentId}/evidence`,
    ];
    for (const path of reads) {
      const response = await victimOwner.get(path);
      expect({ path, status: response.status }).toEqual({ path, status: 403 });
    }
    const writes = [
      () =>
        victimOwner.post(`/platform/billing/payments/${victimPaymentId}/review`, {
          decision: 'VERIFY',
        }),
      () =>
        attacker.post(`/platform/billing/payments/${victimPaymentId}/review`, {
          decision: 'REJECT',
          reason: 'Rogue rejection',
        }),
      () =>
        attacker.post(`/platform/organizations/${b.id}/subscription/cancel`, {
          mode: 'NOW',
          reason: 'Rogue cancellation',
        }),
      () =>
        attacker.put(`/platform/organizations/${b.id}/subscription`, {
          planId,
          status: 'ACTIVE',
          reason: 'Free upgrade',
        }),
      () =>
        attacker.patch(`/platform/organizations/${b.id}/status`, {
          status: 'SUSPENDED',
          reason: 'Rogue suspension',
        }),
      () => attacker.patch(`/platform/plans/${planId}`, { priceMinor: 0 }),
      () =>
        attacker.post('/platform/plans', {
          code: 'rogue',
          name: 'Rogue',
          priceMinor: 0,
          billingInterval: 'MONTHLY',
          trialDays: 365,
        }),
      () => attacker.post('/platform/billing/run'),
    ];
    for (const write of writes) {
      const response = await write();
      expect(response.status).toBe(403);
    }
    expect(await victimSnapshot()).toEqual(before);
    const plan = await harness.prisma.plan.findUniqueOrThrow({ where: { id: planId } });
    expect(plan.priceMinor).toBe(300_000);
    expect(await harness.prisma.plan.count({ where: { code: 'rogue' } })).toBe(0);
  });
});
