import { randomUUID } from 'node:crypto';
import {
  apiErrorResponseSchema,
  billingOverviewSchema,
  checkoutQuoteSchema,
  planSchema,
  platformPaymentPageSchema,
  platformPaymentSchema,
  storefrontSchema,
  subscriptionPaymentSchema,
  subscriptionStateSchema,
} from '@app/contracts';
import request from 'supertest';
import { localDateOf } from '../../src/common/time/zoned-dates';
import { BillingLifecycleService } from '../../src/modules/billing/billing-lifecycle.service';
import {
  addMember,
  API,
  type Client,
  createHarness,
  type Harness,
  ORIGIN,
  registerUser,
} from '../support/auth-harness';

const DAY = 86_400_000;
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('receipt-image'),
]);
const ALL_DAY = [1, 2, 3, 4, 5, 6, 7].flatMap((dayOfWeek) => [
  { dayOfWeek, opensAt: '00:00', closesAt: '12:00' },
  { dayOfWeek, opensAt: '12:00', closesAt: '00:00' },
]);

function code(body: unknown): string | undefined {
  return apiErrorResponseSchema.safeParse(body).data?.code;
}

describe('subscriptions and billing (in-memory Postgres)', () => {
  let harness: Harness;
  let lifecycle: BillingLifecycleService;
  let owner: Client;
  let otherOwner: Client;
  let adminA: Client;
  let adminB: Client;
  let support: Client;
  let planId: string;
  let legacyId: string;
  let trialId: string;
  let trialSlug: string;

  beforeAll(async () => {
    harness = await createHarness();
    lifecycle = harness.app.get(BillingLifecycleService);
    ({ client: owner } = await registerUser(harness, 'billing-owner'));
    ({ client: otherOwner } = await registerUser(harness, 'billing-other'));
    const a = await registerUser(harness, 'billing-admin-a');
    const b = await registerUser(harness, 'billing-admin-b');
    const s = await registerUser(harness, 'billing-support');
    adminA = a.client;
    adminB = b.client;
    support = s.client;
    await harness.prisma.user.updateMany({
      where: { email: { in: [a.email, b.email] } },
      data: { platformRole: 'SUPER_ADMIN' },
    });
    await harness.prisma.user.update({
      where: { email: s.email },
      data: { platformRole: 'SUPPORT' },
    });

    legacyId = await createRestaurant(owner, 'legacy-kitchen');

    planId = planSchema.parse(
      (
        await adminA
          .post('/platform/plans', {
            code: 'starter',
            name: 'Starter',
            priceMinor: 300_000,
            billingInterval: 'MONTHLY',
            trialDays: 14,
            graceDays: 7,
            maxBranches: 1,
            maxProducts: 2,
            maxRiders: 1,
            maxMembers: 2,
          })
          .expect(201)
      ).body,
    ).id;
    await adminA.patch(`/platform/plans/${planId}`, { isDefault: true }).expect(204);
    trialSlug = 'trial-kitchen';
    trialId = await createRestaurant(owner, trialSlug);
  });

  afterAll(async () => {
    await harness.close();
  });

  async function createRestaurant(client: Client, slug: string): Promise<string> {
    const id = (
      (await client.post('/organizations', { name: `${slug} kitchen`, slug }).expect(201)).body as {
        id: string;
      }
    ).id;
    const base = `/organizations/${id}`;
    await client
      .patch(base, {
        description: 'Karahi and naan cooked fresh every day.',
        contactPhone: '+923111111111',
      })
      .expect(200);
    const branch = (
      await client
        .post(`${base}/branches`, {
          name: 'Gulberg',
          phone: '+924235000000',
          addressLine: '12 Main Boulevard',
          city: 'Lahore',
        })
        .expect(201)
    ).body as { id: string };
    await client
      .put(`${base}/branches/${branch.id}/opening-hours`, { intervals: ALL_DAY })
      .expect(200);
    await client
      .put(`${base}/branches/${branch.id}/fulfillment`, {
        deliveryEnabled: false,
        pickupEnabled: true,
        preparationMinutes: 20,
        delivery: null,
      })
      .expect(200);
    const category = (await client.post(`${base}/menu/categories`, { name: 'Karahi' }).expect(201))
      .body as { id: string };
    await client.post(`${base}/menu/products`, product(category.id, 'Chicken Karahi')).expect(201);
    await client.post(`${base}/onboarding/complete`).expect(200);
    return id;
  }

  async function otherBillingId(): Promise<string> {
    return (
      await harness.prisma.organization.findFirstOrThrow({ where: { slug: 'other-billing' } })
    ).id;
  }

  function product(categoryId: string, name: string) {
    return {
      categoryId,
      name,
      status: 'PUBLISHED',
      isAvailable: true,
      variants: [{ name: 'Half', priceMinor: 145_000, isAvailable: true, isDefault: true }],
      addOnGroupIds: [],
    };
  }

  async function subscription(organizationId: string) {
    return harness.prisma.subscription.findFirstOrThrow({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { invoices: { orderBy: { periodStart: 'asc' } } },
    });
  }

  async function state(client: Client, organizationId: string) {
    return subscriptionStateSchema.parse(
      (await client.get(`/organizations/${organizationId}/subscription`).expect(200)).body,
    );
  }

  function submit(
    client: Client,
    organizationId: string,
    fields: Record<string, string>,
    evidence?: Buffer,
  ) {
    let req = request(harness.app.getHttpServer())
      .post(`${API}/organizations/${organizationId}/billing/payments`)
      .set('Origin', ORIGIN)
      .set('Cookie', client.cookie ?? '');
    for (const [name, value] of Object.entries(fields)) {
      req = req.field(name, value);
    }
    return evidence
      ? req.attach('evidence', evidence, { filename: 'receipt.png', contentType: 'image/png' })
      : req;
  }

  async function paymentFields(organizationId: string, reference: string, amount?: number) {
    const sub = await subscription(organizationId);
    const invoice = sub.invoices.find((entry) => entry.status === 'OPEN');
    if (!invoice) {
      throw new Error('No open invoice');
    }
    return {
      invoiceId: invoice.id,
      method: 'BANK_TRANSFER',
      reference,
      amountMinor: String(amount ?? invoice.amountMinor),
      paidOn: localDateOf(new Date(), 'Asia/Karachi'),
    };
  }

  describe('trials and plans', () => {
    it('starts new restaurants on a trial of the default plan at local midnight', async () => {
      const sub = await subscription(trialId);
      expect(sub).toMatchObject({ status: 'TRIALING', priceMinor: 300_000 });
      expect(sub.currentPeriodStart.toISOString()).toMatch(/T19:00:00\.000Z$/);
      expect(sub.trialEndsAt?.getTime()).toBe(sub.currentPeriodStart.getTime() + 14 * DAY);
      expect(sub.invoices).toHaveLength(1);
      const [invoice] = sub.invoices;
      expect(invoice).toMatchObject({
        status: 'OPEN',
        amountMinor: 300_000,
        number: expect.stringMatching(/^INV-\d{6}$/) as unknown,
      });
      expect(invoice?.periodStart.getTime()).toBe(sub.trialEndsAt?.getTime());
      expect(invoice?.dueAt.getTime()).toBe(invoice?.periodStart.getTime());
      expect(invoice?.periodEnd.toISOString()).toMatch(/T19:00:00\.000Z$/);
      const anchor = Number(localDateOf(sub.trialEndsAt ?? new Date(), 'Asia/Karachi').slice(8));
      expect(sub.billingAnchorDay).toBe(anchor);

      const current = await state(owner, trialId);
      expect(current).toMatchObject({
        standing: 'good',
        status: 'TRIALING',
        planName: 'Starter',
        canTakeOrders: true,
      });
      expect(current.usage).toEqual(
        expect.arrayContaining([
          { resource: 'branches', used: 1, limit: 1 },
          { resource: 'products', used: 1, limit: 2 },
        ]),
      );
    });

    it('leaves restaurants without a plan unmanaged and unlimited', async () => {
      expect((await state(owner, legacyId)).standing).toBe('unmanaged');
      await owner
        .post(`/organizations/${legacyId}/branches`, {
          name: 'DHA',
          phone: '+924235000001',
          addressLine: '1 Phase 5 Road',
          city: 'Lahore',
        })
        .expect(201);
    });

    it('protects plan settings', async () => {
      await support.patch(`/platform/plans/${planId}`, { priceMinor: 1 }).expect(403);
      const deactivate = await adminA
        .patch(`/platform/plans/${planId}`, { isActive: false })
        .expect(409);
      expect(apiErrorResponseSchema.parse(deactivate.body).message).toContain(
        'another default plan',
      );
      await adminA.patch(`/platform/plans/${planId}`, { graceDays: 61 }).expect(400);
      expect(
        await harness.prisma.auditLog.count({
          where: { action: 'platform.plan_updated', entityId: planId },
        }),
      ).toBe(1);
    });
  });

  describe('plan limits', () => {
    it('enforces branch, menu, rider and team limits with an explanation', async () => {
      const base = `/organizations/${trialId}`;
      const branch = await owner
        .post(`${base}/branches`, {
          name: 'DHA',
          phone: '+924235000001',
          addressLine: '1 Phase 5 Road',
          city: 'Lahore',
        })
        .expect(409);
      expect(apiErrorResponseSchema.parse(branch.body)).toMatchObject({
        code: 'PLAN_LIMIT_REACHED',
        message: expect.stringContaining('Starter plan includes 1 branch') as unknown,
      });

      const category = await harness.prisma.category.findFirstOrThrow({
        where: { organizationId: trialId },
      });
      await owner.post(`${base}/menu/products`, product(category.id, 'Mutton Karahi')).expect(201);
      const third = await owner
        .post(`${base}/menu/products`, product(category.id, 'Daal'))
        .expect(409);
      expect(code(third.body)).toBe('PLAN_LIMIT_REACHED');

      const branchId = (
        await harness.prisma.branch.findFirstOrThrow({ where: { organizationId: trialId } })
      ).id;
      const rider = (
        await owner
          .post(`${base}/riders`, {
            branchId,
            fullName: 'Imran',
            phone: '+923001110001',
            vehicleType: 'MOTORCYCLE',
          })
          .expect(201)
      ).body as { id: string };
      await owner
        .post(`${base}/riders`, {
          branchId,
          fullName: 'Asad',
          phone: '+923001110002',
          vehicleType: 'MOTORCYCLE',
        })
        .expect(409);
      await owner.patch(`${base}/riders/${rider.id}`, { status: 'INACTIVE' }).expect(200);
      const second = (
        await owner
          .post(`${base}/riders`, {
            branchId,
            fullName: 'Asad',
            phone: '+923001110002',
            vehicleType: 'MOTORCYCLE',
          })
          .expect(201)
      ).body as { id: string };
      expect(second.id).toBeDefined();
      await owner.patch(`${base}/riders/${rider.id}`, { status: 'ACTIVE' }).expect(409);

      await addMember(harness, owner, trialId, 'MANAGER', 'billing-manager');
      const invite = await owner
        .post(`${base}/members`, {
          email: 'third@example.com',
          fullName: 'Third Person',
          role: 'ORDER_STAFF',
        })
        .expect(409);
      expect(apiErrorResponseSchema.parse(invite.body).message).toContain('2 team members');
    });
  });

  describe('manual payments', () => {
    it('records a payment with evidence without marking anything paid', async () => {
      const fields = await paymentFields(trialId, 'TXN-1234 5678');
      const response = await submit(owner, trialId, fields, PNG).expect(201);
      const payment = subscriptionPaymentSchema.parse(response.body);
      expect(payment).toMatchObject({
        status: 'SUBMITTED',
        hasEvidence: true,
        reference: 'TXN-1234 5678',
      });
      const sub = await subscription(trialId);
      expect(sub.status).toBe('TRIALING');
      expect(sub.invoices[0]?.status).toBe('OPEN');

      const evidence = await owner
        .get(`/organizations/${trialId}/billing/payments/${payment.id}/evidence`)
        .expect(200);
      expect(evidence.headers['content-type']).toBe('image/png');
      expect(evidence.headers['cache-control']).toBe('private, no-store');
      await otherOwner
        .get(`/organizations/${trialId}/billing/payments/${payment.id}/evidence`)
        .expect(404);
      await support.get(`/platform/billing/payments/${payment.id}/evidence`).expect(200);
      await request(harness.app.getHttpServer())
        .get(`${API}/media/${trialId}/billing/${payment.id}.png`)
        .expect(404);

      const overview = billingOverviewSchema.parse(
        (await owner.get(`/organizations/${trialId}/billing`).expect(200)).body,
      );
      expect(overview.invoices[0]).toMatchObject({
        status: 'OPEN',
        pendingMinor: 300_000,
        verifiedMinor: 0,
      });
    });

    it('rejects repeated references, even with different spacing or another restaurant', async () => {
      const duplicate = await submit(
        owner,
        trialId,
        await paymentFields(trialId, 'txn 12345678'),
      ).expect(409);
      expect(apiErrorResponseSchema.parse(duplicate.body).details).toEqual([
        { field: 'reference', message: 'This reference has already been submitted' },
      ]);
      const otherId = await createRestaurant(otherOwner, 'other-billing');
      await submit(otherOwner, otherId, await paymentFields(otherId, 'TXN12345678')).expect(409);
      await submit(otherOwner, otherId, {
        ...(await paymentFields(otherId, 'TXN12345678')),
        method: 'JAZZCASH',
      }).expect(201);
    });

    it('validates the payment details and evidence type', async () => {
      const fields = await paymentFields(trialId, 'BANK-REF-77');
      await submit(owner, trialId, { ...fields, paidOn: '2099-01-01' }).expect(400);
      await submit(owner, trialId, { ...fields, reference: '-- --' }).expect(400);
      await submit(owner, trialId, {
        ...fields,
        invoiceId: '018f0000-0000-7000-8000-000000000000',
      }).expect(400);
      const text = await submit(owner, trialId, fields, Buffer.from('not an image')).expect(415);
      expect(code(text.body)).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('lets only owners submit, while managers can read billing', async () => {
      const otherId = await otherBillingId();
      const manager = await addMember(harness, otherOwner, otherId, 'MANAGER', 'billing-mgr2');
      await manager.client.get(`/organizations/${otherId}/billing`).expect(200);
      await submit(manager.client, otherId, await paymentFields(otherId, 'MGR-REF-001')).expect(
        403,
      );
    });

    it('requires a different super admin to review, and never lets support or owners approve', async () => {
      const queue = platformPaymentPageSchema.parse(
        (await support.get('/platform/billing/payments').expect(200)).body,
      );
      const payment = queue.items.find((item) => item.organizationId === trialId);
      expect(payment).toMatchObject({
        status: 'SUBMITTED',
        organizationName: 'trial-kitchen kitchen',
      });
      const id = payment?.id ?? '';
      await support
        .post(`/platform/billing/payments/${id}/review`, { decision: 'VERIFY' })
        .expect(403);
      await owner
        .post(`/platform/billing/payments/${id}/review`, { decision: 'VERIFY' })
        .expect(403);

      const otherId = await otherBillingId();
      const ownSubmission = subscriptionPaymentSchema.parse(
        (await submit(adminA, otherId, await paymentFields(otherId, 'ADMIN-OWN-1')).expect(201))
          .body,
      );
      const self = await adminA
        .post(`/platform/billing/payments/${ownSubmission.id}/review`, { decision: 'VERIFY' })
        .expect(409);
      expect(apiErrorResponseSchema.parse(self.body).message).toContain('another administrator');
      await adminA
        .post(`/platform/billing/payments/${ownSubmission.id}/review`, { decision: 'REJECT' })
        .expect(400);
      const rejected = platformPaymentSchema.parse(
        (
          await adminB
            .post(`/platform/billing/payments/${ownSubmission.id}/review`, {
              decision: 'REJECT',
              reason: 'No matching bank credit',
            })
            .expect(200)
        ).body,
      );
      expect(rejected).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'No matching bank credit',
      });
      await adminB
        .post(`/platform/billing/payments/${ownSubmission.id}/review`, { decision: 'VERIFY' })
        .expect(409);
      await submit(adminA, otherId, await paymentFields(otherId, 'ADMIN-OWN-1')).expect(201);
    });
  });

  describe('lifecycle', () => {
    it('reminds, moves to past due, suspends, and keeps data while ordering pauses', async () => {
      const sub = await subscription(trialId);
      const trialEnd = sub.trialEndsAt ?? new Date();

      const reminders = (template: string) =>
        harness.prisma.notification.count({ where: { organizationId: trialId, template } });

      await lifecycle.run(new Date(trialEnd.getTime() - 6 * DAY));
      expect(await reminders('billing.renewal_due')).toBe(1);
      await lifecycle.run(new Date(trialEnd.getTime() - 6 * DAY));
      expect(await reminders('billing.renewal_due')).toBe(1);
      await lifecycle.run(new Date(trialEnd.getTime() - 2 * DAY));
      expect(await reminders('billing.renewal_due')).toBe(2);

      const pastDue = await lifecycle.run(new Date(trialEnd.getTime() + 60_000));
      expect(pastDue.pastDue).toBeGreaterThanOrEqual(1);
      expect(await reminders('billing.past_due')).toBe(1);
      const late = await subscription(trialId);
      expect(late).toMatchObject({ status: 'PAST_DUE' });
      expect(late.graceEndsAt?.getTime()).toBe(trialEnd.getTime() + 7 * DAY);
      expect(late.currentPeriodStart.getTime()).toBe(trialEnd.getTime());
      expect((await state(owner, trialId)).standing).toBe('grace');
      const storefront = storefrontSchema.parse(
        (
          await request(harness.app.getHttpServer())
            .get(`${API}/storefront/restaurants/${trialSlug}`)
            .expect(200)
        ).body,
      );
      expect(storefront.onlineOrdering).toBe(true);

      const graceEnd = late.graceEndsAt ?? new Date();
      await lifecycle.run(new Date(graceEnd.getTime() - 3_600_000));
      expect(await reminders('billing.grace_ending')).toBe(1);
      expect((await subscription(trialId)).status).toBe('PAST_DUE');
      await lifecycle.run(new Date(graceEnd.getTime() + 60_000));
      expect((await subscription(trialId)).status).toBe('SUSPENDED');
      expect(await reminders('billing.suspended')).toBe(1);

      const restricted = await state(owner, trialId);
      expect(restricted).toMatchObject({ standing: 'restricted', canTakeOrders: false });
      const paused = storefrontSchema.parse(
        (
          await request(harness.app.getHttpServer())
            .get(`${API}/storefront/restaurants/${trialSlug}`)
            .expect(200)
        ).body,
      );
      expect(paused.onlineOrdering).toBe(false);
      expect(paused.categories[0]?.products.length).toBeGreaterThan(0);
      const branchId = paused.branches[0]?.id ?? '';
      const quote = checkoutQuoteSchema.parse(
        (
          await request(harness.app.getHttpServer())
            .post(`${API}/storefront/restaurants/${trialSlug}/checkout/quote`)
            .set('Origin', ORIGIN)
            .send({
              branchId,
              fulfillment: { type: 'PICKUP' },
              paymentMethod: 'CASH',
              items: [
                {
                  productId: paused.categories[0]?.products[0]?.id,
                  variantId: paused.categories[0]?.products[0]?.variants[0]?.id,
                  addOnIds: [],
                  quantity: 1,
                },
              ],
            })
            .expect(200)
        ).body,
      );
      expect(quote.issues).toEqual([
        {
          code: 'STORE_CLOSED',
          field: 'branchId',
          message: 'This restaurant is not taking online orders right now',
        },
      ]);
      const blocked = await owner
        .post(`/organizations/${trialId}/menu/categories`, { name: 'Drinks' })
        .expect(201);
      expect(blocked.status).toBe(201);
      const blockedProduct = await owner
        .post(
          `/organizations/${trialId}/menu/products`,
          product((blocked.body as { id: string }).id, 'Lassi'),
        )
        .expect(402);
      expect(code(blockedProduct.body)).toBe('SUBSCRIPTION_INACTIVE');
      await owner.get(`/organizations/${trialId}/orders`).expect(200);
      await owner.get(`/organizations/${trialId}/menu/products`).expect(200);

      const statusAudit = await harness.prisma.auditLog.findMany({
        where: { organizationId: trialId, action: 'billing.subscription_status_changed' },
        orderBy: { createdAt: 'asc' },
      });
      expect(statusAudit.map((entry) => entry.changes)).toEqual([
        { from: 'TRIALING', to: 'PAST_DUE', reason: 'invoice_unpaid_at_period_start' },
        { from: 'PAST_DUE', to: 'SUSPENDED', reason: 'grace_period_ended' },
      ]);
      expect(statusAudit.every((entry) => entry.actorUserId === null)).toBe(true);
      const queued = await harness.prisma.notification.findMany({
        where: { organizationId: trialId, template: { startsWith: 'billing.' } },
        select: { template: true, recipient: true },
      });
      expect(queued.map((entry) => entry.template).sort()).toEqual([
        'billing.grace_ending',
        'billing.past_due',
        'billing.renewal_due',
        'billing.renewal_due',
        'billing.suspended',
      ]);
      expect(queued.every((entry) => entry.recipient.includes('billing-owner'))).toBe(true);
    });

    it('reactivates on a verified payment with a new period starting today', async () => {
      const queue = platformPaymentPageSchema.parse(
        (await adminB.get(`/platform/billing/payments?organizationId=${trialId}`).expect(200)).body,
      );
      const payment = queue.items[0];
      const verified = platformPaymentSchema.parse(
        (
          await adminB
            .post(`/platform/billing/payments/${payment?.id ?? ''}/review`, { decision: 'VERIFY' })
            .expect(200)
        ).body,
      );
      expect(verified).toMatchObject({
        status: 'VERIFIED',
        invoiceStatus: 'PAID',
        subscriptionStatus: 'ACTIVE',
      });
      const sub = await subscription(trialId);
      const today = localDateOf(new Date(), 'Asia/Karachi');
      expect(sub).toMatchObject({ status: 'ACTIVE', suspendedAt: null, graceEndsAt: null });
      expect(localDateOf(sub.currentPeriodStart, 'Asia/Karachi')).toBe(today);
      expect(sub.currentPeriodStart.toISOString()).toMatch(/T19:00:00\.000Z$/);
      expect(sub.billingAnchorDay).toBe(Number(today.slice(8)));
      const paid = sub.invoices.find((invoice) => invoice.status === 'PAID');
      expect(paid?.periodStart.getTime()).toBe(sub.currentPeriodStart.getTime());
      expect((await state(owner, trialId)).canTakeOrders).toBe(true);

      const audit = await harness.prisma.auditLog.findFirstOrThrow({
        where: {
          organizationId: trialId,
          action: 'billing.subscription_status_changed',
          changes: { path: ['to'], equals: 'ACTIVE' },
        },
      });
      expect(audit.changes).toMatchObject({
        from: 'SUSPENDED',
        reason: 'reactivated_after_payment',
      });
      const verifiedAudit = await harness.prisma.auditLog.findFirstOrThrow({
        where: { action: 'billing.payment_verified', entityId: payment?.id },
      });
      expect(verifiedAudit.actorUserId).not.toBeNull();
    });

    it('renews on time when the next invoice is paid in advance', async () => {
      const sub = await subscription(trialId);
      const end = sub.currentPeriodEnd;
      expect((await lifecycle.run(new Date(end.getTime() - 5 * DAY))).invoicesCreated).toBe(1);
      const next = (await subscription(trialId)).invoices.find(
        (invoice) => invoice.periodStart.getTime() === end.getTime(),
      );
      expect(next).toMatchObject({ status: 'OPEN', amountMinor: 300_000 });
      expect(next?.periodEnd.toISOString()).toMatch(/T19:00:00\.000Z$/);
      expect(
        Number(localDateOf(next?.periodEnd ?? new Date(), 'Asia/Karachi').slice(8)),
      ).toBeLessThanOrEqual(sub.billingAnchorDay);
      const advance = subscriptionPaymentSchema.parse(
        (
          await submit(owner, trialId, {
            ...(await paymentFields(trialId, 'ADVANCE-0001')),
            invoiceId: next?.id ?? '',
          }).expect(201)
        ).body,
      );
      await adminB
        .post(`/platform/billing/payments/${advance.id}/review`, { decision: 'VERIFY' })
        .expect(200);
      expect((await subscription(trialId)).status).toBe('ACTIVE');

      const renewal = await lifecycle.run(new Date(end.getTime() + 60_000));
      expect(renewal.renewed).toBe(1);
      const renewed = await subscription(trialId);
      expect(renewed).toMatchObject({ status: 'ACTIVE' });
      expect(renewed.currentPeriodStart.getTime()).toBe(end.getTime());
      expect(renewed.currentPeriodEnd.getTime()).toBe(next?.periodEnd.getTime());
    });

    it('marks an invoice paid only once split payments together cover it', async () => {
      const splitId = await createRestaurant(owner, `split-${randomUUID().slice(0, 6)}`);
      const invoice = (await subscription(splitId)).invoices.find(
        (entry) => entry.status === 'OPEN',
      );
      const half = Math.ceil((invoice?.amountMinor ?? 0) / 2);
      const payments = [];
      for (const reference of ['SPLIT-PART-1', 'SPLIT-PART-2']) {
        payments.push(
          subscriptionPaymentSchema.parse(
            (
              await submit(owner, splitId, await paymentFields(splitId, reference, half)).expect(
                201,
              )
            ).body,
          ),
        );
      }
      await adminA
        .post(`/platform/billing/payments/${payments[0]?.id ?? ''}/review`, { decision: 'VERIFY' })
        .expect(200);
      const afterFirst = await harness.prisma.subscriptionInvoice.findUniqueOrThrow({
        where: { id: invoice?.id ?? '' },
      });
      expect(afterFirst.status).toBe('OPEN');
      await adminA
        .post(`/platform/billing/payments/${payments[1]?.id ?? ''}/review`, { decision: 'VERIFY' })
        .expect(200);
      const afterSecond = await harness.prisma.subscriptionInvoice.findUniqueOrThrow({
        where: { id: invoice?.id ?? '' },
      });
      expect(afterSecond.status).toBe('PAID');
    });

    it('cancels at the end of the period and expires long suspensions without deleting data', async () => {
      await support
        .post(`/platform/organizations/${trialId}/subscription/cancel`, {
          mode: 'PERIOD_END',
          reason: 'Owner leaving',
        })
        .expect(403);
      await adminA
        .post(`/platform/organizations/${trialId}/subscription/cancel`, {
          mode: 'PERIOD_END',
          reason: 'Owner asked to stop',
        })
        .expect(204);
      const sub = await subscription(trialId);
      expect(sub.cancelAtPeriodEnd).toBe(true);
      const canceled = await lifecycle.run(new Date(sub.currentPeriodEnd.getTime() + 60_000));
      expect(canceled.canceled).toBe(1);
      const after = await subscription(trialId);
      expect(after.status).toBe('CANCELED');
      expect(after.invoices.filter((invoice) => invoice.status === 'OPEN')).toEqual([]);
      expect((await state(owner, trialId)).standing).toBe('restricted');
      expect(await harness.prisma.product.count({ where: { organizationId: trialId } })).toBe(2);

      const otherId = await otherBillingId();
      const other = await subscription(otherId);
      const suspendAt = new Date(
        (other.graceEndsAt ?? other.trialEndsAt ?? new Date()).getTime() + 30 * DAY,
      );
      await lifecycle.run(suspendAt);
      const suspended = await subscription(otherId);
      expect(suspended.status).toBe('SUSPENDED');
      await lifecycle.run(new Date((suspended.suspendedAt ?? new Date()).getTime() + 59 * DAY));
      expect((await subscription(otherId)).status).toBe('SUSPENDED');
      const expired = await lifecycle.run(
        new Date((suspended.suspendedAt ?? new Date()).getTime() + 61 * DAY),
      );
      expect(expired.expired).toBe(1);
      const final = await subscription(otherId);
      expect(final.status).toBe('EXPIRED');
      expect(final.invoices.every((invoice) => invoice.status !== 'OPEN')).toBe(true);
      expect(await harness.prisma.product.count({ where: { organizationId: otherId } })).toBe(1);
      await request(harness.app.getHttpServer())
        .get(`${API}/storefront/restaurants/other-billing`)
        .expect(200);
    });
  });
});
