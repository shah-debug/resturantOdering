import { randomUUID } from 'node:crypto';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  addOnGroupSchema,
  apiErrorResponseSchema,
  branchSchema,
  categorySchema,
  checkoutQuoteSchema,
  orderCountsSchema,
  orderDetailSchema,
  type OrderDetail,
  orderPageSchema,
  placedOrderSchema,
  productDetailSchema,
  riderListSchema,
  riderSchema,
} from '@app/contracts';
import request from 'supertest';
import { vi } from 'vitest';
import { NotificationDispatcher } from '../../src/modules/notifications/notification-dispatcher.service';
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
const STAFF_EMAIL = 'kitchen-alerts@example.com';

interface Restaurant {
  id: string;
  slug: string;
  branchIds: [string, string];
  karahiId: string;
  halfId: string;
  naanId: string;
}

function code(body: unknown): string | undefined {
  return apiErrorResponseSchema.safeParse(body).data?.code;
}

describe('order operations (in-memory Postgres)', () => {
  let harness: Harness;
  let owner: Client;
  let manager: Client;
  let orderStaff: Client;
  let kitchen: Client;
  let riderMember: Client;
  let branchStaff: Client;
  let stranger: Client;
  let restaurant: Restaurant;
  let other: Restaurant;
  let orders: string;

  beforeAll(async () => {
    harness = await createHarness();
    ({ client: owner } = await registerUser(harness, 'ops-owner'));
    ({ client: stranger } = await registerUser(harness, 'ops-stranger'));
    restaurant = await createRestaurant(owner, 'ops-karahi', STAFF_EMAIL);
    other = await createRestaurant(stranger, 'ops-other', null);
    orders = `/organizations/${restaurant.id}/orders`;
    ({ client: manager } = await addMember(harness, owner, restaurant.id, 'MANAGER', 'ops-mgr'));
    ({ client: orderStaff } = await addMember(
      harness,
      owner,
      restaurant.id,
      'ORDER_STAFF',
      'ops-staff',
    ));
    ({ client: kitchen } = await addMember(
      harness,
      owner,
      restaurant.id,
      'KITCHEN_STAFF',
      'ops-kitchen',
    ));
    ({ client: riderMember } = await addMember(
      harness,
      owner,
      restaurant.id,
      'RIDER',
      'ops-rider',
    ));
    const scoped = await addMember(harness, owner, restaurant.id, 'ORDER_STAFF', 'ops-branch');
    branchStaff = scoped.client;
    await harness.prisma.membership.update({
      where: { id: scoped.membershipId },
      data: { branchId: restaurant.branchIds[1] },
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  async function createRestaurant(
    client: Client,
    slug: string,
    contactEmail: string | null,
  ): Promise<Restaurant> {
    const id = (
      (await client.post('/organizations', { name: `${slug} kitchen`, slug }).expect(201)).body as {
        id: string;
      }
    ).id;
    const base = `/organizations/${id}`;
    await client
      .patch(base, {
        description: 'Charcoal karahi and fresh naan, cooked to order.',
        contactPhone: '+923111111111',
        ...(contactEmail ? { contactEmail } : {}),
      })
      .expect(200);
    const branchIds: string[] = [];
    for (const [name, area] of [
      ['Gulberg', 'Gulberg III'],
      ['DHA', 'DHA Phase 5'],
    ] as const) {
      const branch = branchSchema.parse(
        (
          await client
            .post(`${base}/branches`, {
              name,
              phone: '+924235000000',
              addressLine: '12 Main Boulevard',
              area,
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
    const karahi = productDetailSchema.parse(
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
      branchIds: [branchIds[0] ?? '', branchIds[1] ?? ''],
      karahiId: karahi.id,
      halfId: karahi.variants[0]?.id ?? '',
      naanId: bread.addOns[0]?.id ?? '',
    };
  }

  function publicPost(path: string, body: object, headers: Record<string, string> = {}) {
    let req = request(harness.app.getHttpServer())
      .post(`${API}/storefront/restaurants${path}`)
      .set('Origin', ORIGIN);
    for (const [name, value] of Object.entries(headers)) {
      req = req.set(name, value);
    }
    return req.send(body);
  }

  async function placeOrder(
    options: {
      type?: 'DELIVERY' | 'PICKUP';
      branch?: 0 | 1;
      target?: Restaurant;
      key?: string;
    } = {},
  ): Promise<{ orderId: string; orderNumber: number; trackingToken: string }> {
    const target = options.target ?? restaurant;
    const body = {
      branchId: target.branchIds[options.branch ?? 0],
      fulfillment:
        options.type === 'PICKUP'
          ? { type: 'PICKUP' }
          : {
              type: 'DELIVERY',
              address: { addressLine: '45 Canal View Road', area: 'Model Town', city: 'Lahore' },
            },
      paymentMethod: 'CASH',
      items: [
        {
          productId: target.karahiId,
          variantId: target.halfId,
          addOnIds: [target.naanId],
          quantity: 1,
        },
      ],
    };
    const quote = checkoutQuoteSchema.parse(
      (await publicPost(`/${target.slug}/checkout/quote`, body).expect(200)).body,
    );
    const response = await publicPost(
      `/${target.slug}/orders`,
      {
        ...body,
        customer: { name: 'Bilal Ahmed', phone: '+923009876543' },
        expectedTotalMinor: quote.totals?.totalMinor ?? 0,
      },
      { 'Idempotency-Key': options.key ?? randomUUID() },
    );
    expect([200, 201]).toContain(response.status);
    return placedOrderSchema.parse(response.body);
  }

  function move(
    client: Client,
    orderId: string,
    expectedStatus: string,
    to: string,
    reason?: string,
  ) {
    return client.post(`${orders}/${orderId}/transitions`, {
      to,
      expectedStatus,
      ...(reason ? { reason } : {}),
    });
  }

  async function moveOk(
    client: Client,
    orderId: string,
    expectedStatus: string,
    to: string,
    reason?: string,
  ): Promise<OrderDetail> {
    return orderDetailSchema.parse(
      (await move(client, orderId, expectedStatus, to, reason).expect(200)).body,
    );
  }

  async function createRider(client: Client, branch: 0 | 1, phone: string, target = restaurant) {
    return riderSchema.parse(
      (
        await client
          .post(`/organizations/${target.id}/riders`, {
            branchId: target.branchIds[branch],
            fullName: `Rider ${phone.slice(-4)}`,
            phone,
            vehicleType: 'MOTORCYCLE',
            vehicleNumber: 'lea-1234',
          })
          .expect(201)
      ).body,
    );
  }

  describe('listing', () => {
    it('shows new orders with counts, search and filters', async () => {
      const delivery = await placeOrder();
      const pickup = await placeOrder({ type: 'PICKUP' });

      const page = orderPageSchema.parse((await owner.get(`${orders}?view=new`).expect(200)).body);
      expect(page.items.map((item) => item.id)).toEqual(
        expect.arrayContaining([delivery.orderId, pickup.orderId]),
      );
      const item = page.items.find((entry) => entry.id === delivery.orderId);
      expect(item).toMatchObject({
        status: 'PENDING',
        type: 'DELIVERY',
        branchName: 'Gulberg',
        customerName: 'Bilal Ahmed',
        itemCount: 1,
        availableTransitions: expect.arrayContaining([
          'CONFIRMED',
          'REJECTED',
          'CANCELLED',
        ]) as unknown,
      });

      const counts = orderCountsSchema.parse(
        (await owner.get(`${orders}/counts`).expect(200)).body,
      );
      expect(counts.new).toBeGreaterThanOrEqual(2);

      const byNumber = orderPageSchema.parse(
        (await owner.get(`${orders}?view=new&search=%23${delivery.orderNumber}`).expect(200)).body,
      );
      expect(byNumber.items.map((entry) => entry.id)).toEqual([delivery.orderId]);
      const pickups = orderPageSchema.parse(
        (await owner.get(`${orders}?view=new&type=PICKUP`).expect(200)).body,
      );
      expect(pickups.items.every((entry) => entry.type === 'PICKUP')).toBe(true);
      const paged = orderPageSchema.parse(
        (await owner.get(`${orders}?view=new&pageSize=1&page=2`).expect(200)).body,
      );
      expect(paged).toMatchObject({ page: 2, pageSize: 1 });
      expect(paged.items).toHaveLength(1);

      await owner.get(`${orders}?view=nope`).expect(400);
    });

    it('shows order detail with customizations and delivery details', async () => {
      const placed = await placeOrder();
      const detail = orderDetailSchema.parse(
        (await kitchen.get(`${orders}/${placed.orderId}`).expect(200)).body,
      );
      expect(detail).toMatchObject({
        customerPhone: '+923009876543',
        delivery: {
          addressLine: '45 Canal View Road',
          area: 'Model Town',
          zoneName: 'Standard delivery',
        },
        items: [
          expect.objectContaining({
            productName: 'Chicken Karahi',
            addOns: [expect.objectContaining({ name: 'Naan', groupName: 'Bread' })],
          }),
        ],
        timeline: [expect.objectContaining({ toStatus: 'PENDING', actorType: 'CUSTOMER' })],
        availableTransitions: [],
        canAssignRider: false,
      });
    });
  });

  describe('access control', () => {
    it('keeps orders inside their organization', async () => {
      const placed = await placeOrder();
      const foreign = await placeOrder({ target: other });
      await stranger.get(orders).expect(404);
      await stranger.get(`${orders}/${placed.orderId}`).expect(404);
      await owner.get(`${orders}/${foreign.orderId}`).expect(404);
      await move(owner, foreign.orderId, 'PENDING', 'CONFIRMED').expect(404);
      await stranger
        .post(`/organizations/${other.id}/orders/${placed.orderId}/transitions`, {
          to: 'CONFIRMED',
          expectedStatus: 'PENDING',
        })
        .expect(404);
    });

    it('applies role permissions to each transition', async () => {
      const placed = await placeOrder();
      await riderMember.get(orders).expect(403);
      expect(
        code((await move(kitchen, placed.orderId, 'PENDING', 'CONFIRMED').expect(403)).body),
      ).toBe('FORBIDDEN');
      await moveOk(orderStaff, placed.orderId, 'PENDING', 'CONFIRMED');
      const kitchenView = orderDetailSchema.parse(
        (await kitchen.get(`${orders}/${placed.orderId}`).expect(200)).body,
      );
      expect(kitchenView.availableTransitions).toEqual(['PREPARING']);
      await moveOk(kitchen, placed.orderId, 'CONFIRMED', 'PREPARING');
      await moveOk(kitchen, placed.orderId, 'PREPARING', 'READY');
      await move(kitchen, placed.orderId, 'READY', 'CANCELLED', 'Out of gas').expect(403);
    });

    it('limits branch-scoped staff to their branch', async () => {
      const mine = await placeOrder({ branch: 1 });
      const notMine = await placeOrder({ branch: 0 });
      const page = orderPageSchema.parse(
        (await branchStaff.get(`${orders}?view=new&pageSize=100`).expect(200)).body,
      );
      expect(page.items.map((item) => item.id)).toContain(mine.orderId);
      expect(page.items.every((item) => item.branchId === restaurant.branchIds[1])).toBe(true);
      const forced = orderPageSchema.parse(
        (
          await branchStaff
            .get(`${orders}?view=new&pageSize=100&branchId=${restaurant.branchIds[0]}`)
            .expect(200)
        ).body,
      );
      expect(forced.items.map((item) => item.id)).not.toContain(notMine.orderId);
      await branchStaff.get(`${orders}/${notMine.orderId}`).expect(404);
      await move(branchStaff, notMine.orderId, 'PENDING', 'CONFIRMED').expect(404);
    });
  });

  describe('transitions', () => {
    it('rejects invalid and stale transitions', async () => {
      const placed = await placeOrder();
      const invalid = await move(owner, placed.orderId, 'PENDING', 'READY').expect(409);
      expect(apiErrorResponseSchema.parse(invalid.body).message).toBe(
        'An order cannot move from PENDING to READY.',
      );
      await move(owner, placed.orderId, 'PENDING', 'DELIVERED').expect(409);
      await move(owner, placed.orderId, 'CONFIRMED', 'PREPARING').expect(409);
      await move(owner, placed.orderId, 'PENDING', 'PENDING').expect(409);
      const noReason = await move(owner, placed.orderId, 'PENDING', 'REJECTED').expect(400);
      expect(apiErrorResponseSchema.parse(noReason.body).details).toEqual([
        { field: 'reason', message: 'Give a reason' },
      ]);
    });

    it('records rejection reasons, the actor and cancels the payment', async () => {
      const placed = await placeOrder();
      const rejected = await moveOk(
        manager,
        placed.orderId,
        'PENDING',
        'REJECTED',
        'Kitchen closing early',
      );
      expect(rejected).toMatchObject({
        status: 'REJECTED',
        cancellationReason: 'Kitchen closing early',
        availableTransitions: [],
      });
      expect(rejected.cancelledAt).not.toBeNull();
      expect(rejected.timeline.at(-1)).toMatchObject({
        fromStatus: 'PENDING',
        toStatus: 'REJECTED',
        actorType: 'STAFF',
        actorName: 'ops-mgr member',
        note: 'Kitchen closing early',
      });
      const payment = await harness.prisma.payment.findFirstOrThrow({
        where: { orderId: placed.orderId },
      });
      expect(payment.status).toBe('CANCELLED');
      expect(
        await harness.prisma.auditLog.count({
          where: { entityId: placed.orderId, action: 'order.status_changed' },
        }),
      ).toBe(1);
    });

    it('completes a pickup order and records the cash as collected', async () => {
      const placed = await placeOrder({ type: 'PICKUP' });
      await moveOk(orderStaff, placed.orderId, 'PENDING', 'CONFIRMED');
      await moveOk(kitchen, placed.orderId, 'CONFIRMED', 'PREPARING');
      const ready = await moveOk(kitchen, placed.orderId, 'PREPARING', 'READY');
      expect(ready.availableTransitions).toEqual([]);
      const staffView = orderDetailSchema.parse(
        (await orderStaff.get(`${orders}/${placed.orderId}`).expect(200)).body,
      );
      expect(staffView.availableTransitions).toEqual(['COMPLETED', 'CANCELLED']);
      await move(orderStaff, placed.orderId, 'READY', 'OUT_FOR_DELIVERY').expect(409);
      const done = await moveOk(orderStaff, placed.orderId, 'READY', 'COMPLETED');
      expect(done).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PAID' });
      expect(done.completedAt).not.toBeNull();
      const payment = await harness.prisma.payment.findFirstOrThrow({
        where: { orderId: placed.orderId },
      });
      expect(payment).toMatchObject({ status: 'SUCCEEDED', collectedByRiderId: null });
      expect(payment.paidAt).not.toBeNull();
    });

    it('lets exactly one of two simultaneous updates win', async () => {
      const placed = await placeOrder();
      const responses = await Promise.all([
        move(owner, placed.orderId, 'PENDING', 'CONFIRMED'),
        move(orderStaff, placed.orderId, 'PENDING', 'REJECTED', 'Duplicate order'),
        move(manager, placed.orderId, 'PENDING', 'CANCELLED', 'Customer called'),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 409, 409]);
      const history = await harness.prisma.orderStatusHistory.findMany({
        where: { orderId: placed.orderId },
      });
      expect(history).toHaveLength(2);
    });
  });

  describe('riders', () => {
    it('manages riders per branch with role checks', async () => {
      const rider = await createRider(owner, 0, '+923001110001');
      expect(rider).toMatchObject({
        branchName: 'Gulberg',
        vehicleNumber: 'LEA-1234',
        status: 'ACTIVE',
        availability: 'AVAILABLE',
        activeDeliveries: 0,
      });
      const duplicate = await owner
        .post(`/organizations/${restaurant.id}/riders`, {
          branchId: restaurant.branchIds[0],
          fullName: 'Copy',
          phone: '+923001110001',
          vehicleType: 'BICYCLE',
        })
        .expect(409);
      expect(code(duplicate.body)).toBe('CONFLICT');
      await owner
        .post(`/organizations/${restaurant.id}/riders`, {
          branchId: other.branchIds[0],
          fullName: 'Wrong branch',
          phone: '+923001110002',
          vehicleType: 'BICYCLE',
        })
        .expect(400);
      await orderStaff.get(`/organizations/${restaurant.id}/riders`).expect(200);
      await orderStaff
        .post(`/organizations/${restaurant.id}/riders`, {
          branchId: restaurant.branchIds[0],
          fullName: 'Nope',
          phone: '+923001110003',
          vehicleType: 'CAR',
        })
        .expect(403);
      await kitchen.get(`/organizations/${restaurant.id}/riders`).expect(403);
      await stranger.get(`/organizations/${restaurant.id}/riders`).expect(404);

      const branchRider = await createRider(manager, 1, '+923001110004');
      const scoped = riderListSchema.parse(
        (await branchStaff.get(`/organizations/${restaurant.id}/riders`).expect(200)).body,
      );
      expect(scoped.map((entry) => entry.id)).toEqual([branchRider.id]);

      const updated = riderSchema.parse(
        (
          await owner
            .put(`/organizations/${restaurant.id}/riders/${rider.id}`, {
              branchId: restaurant.branchIds[0],
              fullName: 'Imran Khan',
              phone: '+923001110001',
              vehicleType: 'BICYCLE',
              vehicleNumber: '',
            })
            .expect(200)
        ).body,
      );
      expect(updated).toMatchObject({
        fullName: 'Imran Khan',
        vehicleType: 'BICYCLE',
        vehicleNumber: null,
      });
      const inactive = riderSchema.parse(
        (
          await owner
            .patch(`/organizations/${restaurant.id}/riders/${rider.id}`, { status: 'INACTIVE' })
            .expect(200)
        ).body,
      );
      expect(inactive).toMatchObject({ status: 'INACTIVE', availability: 'OFFLINE' });
    });

    it('assigns, reassigns and dispatches riders within the order branch', async () => {
      const first = await createRider(owner, 0, '+923002220001');
      const second = await createRider(owner, 0, '+923002220002');
      const otherBranch = await createRider(owner, 1, '+923002220003');
      const foreign = await createRider(stranger, 0, '+923002220004', other);
      const placed = await placeOrder();
      const riderPath = `${orders}/${placed.orderId}/rider`;

      await owner.put(riderPath, { riderId: first.id, expectedRiderId: null }).expect(409);
      await moveOk(owner, placed.orderId, 'PENDING', 'CONFIRMED');

      const wrongBranch = await owner
        .put(riderPath, { riderId: otherBranch.id, expectedRiderId: null })
        .expect(422);
      expect(apiErrorResponseSchema.parse(wrongBranch.body).message).toBe(
        'This rider works at another branch',
      );
      await owner.put(riderPath, { riderId: foreign.id, expectedRiderId: null }).expect(422);
      await kitchen.put(riderPath, { riderId: first.id, expectedRiderId: null }).expect(403);

      const assigned = orderDetailSchema.parse(
        (await orderStaff.put(riderPath, { riderId: first.id, expectedRiderId: null }).expect(200))
          .body,
      );
      expect(assigned.rider?.id).toBe(first.id);
      await owner.put(riderPath, { riderId: second.id, expectedRiderId: null }).expect(409);
      const reassigned = orderDetailSchema.parse(
        (await owner.put(riderPath, { riderId: second.id, expectedRiderId: first.id }).expect(200))
          .body,
      );
      expect(reassigned.rider?.id).toBe(second.id);

      await moveOk(kitchen, placed.orderId, 'CONFIRMED', 'PREPARING');
      const ready = await moveOk(kitchen, placed.orderId, 'PREPARING', 'READY');
      expect(ready.canAssignRider).toBe(false);
      const out = await moveOk(orderStaff, placed.orderId, 'READY', 'OUT_FOR_DELIVERY');
      expect(out.canAssignRider).toBe(false);
      expect(
        (await harness.prisma.rider.findUniqueOrThrow({ where: { id: second.id } })).availability,
      ).toBe('ON_DELIVERY');
      await owner.put(riderPath, { riderId: first.id, expectedRiderId: second.id }).expect(409);
      await owner
        .patch(`/organizations/${restaurant.id}/riders/${second.id}`, { status: 'INACTIVE' })
        .expect(409);

      await move(orderStaff, placed.orderId, 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED').expect(400);
      const failed = await moveOk(
        orderStaff,
        placed.orderId,
        'OUT_FOR_DELIVERY',
        'DELIVERY_FAILED',
        'Customer not answering',
      );
      expect(failed.canAssignRider).toBe(true);
      expect(
        (await harness.prisma.rider.findUniqueOrThrow({ where: { id: second.id } })).availability,
      ).toBe('AVAILABLE');
      await owner.put(riderPath, { riderId: first.id, expectedRiderId: second.id }).expect(200);
      await moveOk(orderStaff, placed.orderId, 'DELIVERY_FAILED', 'OUT_FOR_DELIVERY');
      const delivered = await moveOk(orderStaff, placed.orderId, 'OUT_FOR_DELIVERY', 'DELIVERED');
      expect(delivered).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID' });
      const payment = await harness.prisma.payment.findFirstOrThrow({
        where: { orderId: placed.orderId },
      });
      expect(payment).toMatchObject({ status: 'SUCCEEDED', collectedByRiderId: first.id });
      expect(
        (await harness.prisma.rider.findUniqueOrThrow({ where: { id: first.id } })).availability,
      ).toBe('AVAILABLE');
    });

    it('rejects inactive riders and assignment on pickup orders', async () => {
      const rider = await createRider(owner, 0, '+923003330001');
      await owner
        .patch(`/organizations/${restaurant.id}/riders/${rider.id}`, { status: 'INACTIVE' })
        .expect(200);
      const placed = await placeOrder();
      await moveOk(owner, placed.orderId, 'PENDING', 'CONFIRMED');
      await owner
        .put(`${orders}/${placed.orderId}/rider`, { riderId: rider.id, expectedRiderId: null })
        .expect(422);
      const pickup = await placeOrder({ type: 'PICKUP' });
      await moveOk(owner, pickup.orderId, 'PENDING', 'CONFIRMED');
      await owner
        .put(`${orders}/${pickup.orderId}/rider`, { riderId: null, expectedRiderId: null })
        .expect(409);
    });
  });

  describe('customer tracking after staff actions', () => {
    it('does not reveal riders, reasons or staff names', async () => {
      const rider = await createRider(owner, 0, '+923004440001');
      const placed = await placeOrder();
      await moveOk(owner, placed.orderId, 'PENDING', 'CONFIRMED');
      await owner
        .put(`${orders}/${placed.orderId}/rider`, { riderId: rider.id, expectedRiderId: null })
        .expect(200);
      await moveOk(owner, placed.orderId, 'CONFIRMED', 'PREPARING');
      await moveOk(owner, placed.orderId, 'PREPARING', 'READY');
      await moveOk(owner, placed.orderId, 'READY', 'OUT_FOR_DELIVERY');
      await moveOk(
        owner,
        placed.orderId,
        'OUT_FOR_DELIVERY',
        'DELIVERY_FAILED',
        'Gate locked, secret note',
      );
      const response = await request(harness.app.getHttpServer())
        .get(`${API}/storefront/restaurants/${restaurant.slug}/orders/${placed.orderId}`)
        .set('X-Order-Token', placed.trackingToken)
        .expect(200);
      const raw = JSON.stringify(response.body);
      for (const secret of [
        rider.fullName,
        rider.phone,
        rider.id,
        'secret note',
        'ops-owner',
        'STAFF',
      ]) {
        expect(raw).not.toContain(secret);
      }
      expect((response.body as { status: string }).status).toBe('DELIVERY_FAILED');
    });
  });

  describe('notification outbox', () => {
    let dispatcher: NotificationDispatcher;

    beforeAll(() => {
      dispatcher = harness.app.get(NotificationDispatcher);
    });

    beforeEach(async () => {
      await harness.prisma.notification.updateMany({
        where: { status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    });

    it('queues one staff email per order, even for repeated submissions', async () => {
      const key = randomUUID();
      const placed = await placeOrder({ key });
      await placeOrder({ key });
      const queued = await harness.prisma.notification.findMany({
        where: { orderId: placed.orderId },
      });
      expect(queued).toEqual([
        expect.objectContaining({
          channel: 'EMAIL',
          template: 'order.placed.staff',
          recipient: STAFF_EMAIL,
          status: 'PENDING',
          dedupeKey: `order.placed.staff:${placed.orderId}:${STAFF_EMAIL}`,
        }),
      ]);
      const otherOrder = await placeOrder({ target: other });
      expect(
        await harness.prisma.notification.count({ where: { orderId: otherOrder.orderId } }),
      ).toBe(0);
    });

    it('sends each notification once even with overlapping dispatchers', async () => {
      const placed = await placeOrder();
      const before = harness.mailer.messages.length;
      const results = await Promise.all([dispatcher.dispatchDue(), dispatcher.dispatchDue()]);
      expect(results.reduce((sum, result) => sum + result.sent, 0)).toBeGreaterThanOrEqual(1);
      const sentForOrder = harness.mailer.messages
        .slice(before)
        .filter((message) => message.text.includes(placed.orderId));
      expect(sentForOrder).toHaveLength(1);
      expect(sentForOrder[0]).toMatchObject({
        to: STAFF_EMAIL,
        subject: `New order #${placed.orderNumber} · Rs 1,650`,
      });
      expect(await dispatcher.dispatchDue()).toEqual({ sent: 0, retried: 0, failed: 0 });
      const row = await harness.prisma.notification.findFirstOrThrow({
        where: { orderId: placed.orderId },
      });
      expect(row).toMatchObject({ status: 'SENT', attempts: 1 });
      expect(row.sentAt).not.toBeNull();
    });

    it('retries failures with backoff and gives up after the last attempt', async () => {
      const placed = await placeOrder();
      const send = vi.spyOn(harness.mailer, 'send').mockRejectedValue(new Error('SMTP down'));
      try {
        expect(await dispatcher.dispatchDue()).toEqual({ sent: 0, retried: 1, failed: 0 });
        const retrying = await harness.prisma.notification.findFirstOrThrow({
          where: { orderId: placed.orderId },
        });
        expect(retrying).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'SMTP down' });
        const backoff = await harness.prisma.$queryRaw<{ later: boolean }[]>`
          SELECT scheduled_at > now() + interval '20 seconds' AS later FROM notifications
          WHERE id = ${retrying.id}::uuid`;
        expect(backoff).toEqual([{ later: true }]);
        expect(await dispatcher.dispatchDue()).toEqual({ sent: 0, retried: 0, failed: 0 });

        await harness.prisma.notification.update({
          where: { id: retrying.id },
          data: { attempts: 4, scheduledAt: new Date(0) },
        });
        expect(await dispatcher.dispatchDue()).toEqual({ sent: 0, retried: 0, failed: 1 });
        const failed = await harness.prisma.notification.findUniqueOrThrow({
          where: { id: retrying.id },
        });
        expect(failed).toMatchObject({ status: 'FAILED', attempts: 5 });
      } finally {
        send.mockRestore();
      }
      const order = await harness.prisma.order.findUniqueOrThrow({ where: { id: placed.orderId } });
      expect(order.status).toBe('PENDING');
    });
  });

  describe('live updates', () => {
    let port: number;

    beforeAll(async () => {
      const server = harness.app.getHttpServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      port = (server.address() as AddressInfo).port;
    });

    interface Stream {
      status: number;
      events: { event: string; data: string }[];
      waitFor: (predicate: (event: { event: string; data: string }) => boolean) => Promise<void>;
      close: () => void;
    }

    function openStream(client: Client, organizationId = restaurant.id): Promise<Stream> {
      return new Promise((resolve, reject) => {
        const events: { event: string; data: string }[] = [];
        const waiters: {
          predicate: (e: { event: string; data: string }) => boolean;
          done: () => void;
        }[] = [];
        const req = httpRequest(
          {
            host: '127.0.0.1',
            port,
            path: `${API}/organizations/${organizationId}/orders/events`,
            headers: { Cookie: client.cookie ?? '', Accept: 'text/event-stream' },
          },
          (response: IncomingMessage) => {
            let buffer = '';
            response.setEncoding('utf8');
            response.on('data', (chunk: string) => {
              buffer += chunk;
              let boundary = buffer.indexOf('\n\n');
              while (boundary >= 0) {
                const block = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
                const data = /^data: (.*)$/m.exec(block)?.[1] ?? '';
                const parsed = { event, data };
                events.push(parsed);
                for (const waiter of [...waiters]) {
                  if (waiter.predicate(parsed)) {
                    waiters.splice(waiters.indexOf(waiter), 1);
                    waiter.done();
                  }
                }
                boundary = buffer.indexOf('\n\n');
              }
            });
            resolve({
              status: response.statusCode ?? 0,
              events,
              waitFor: (predicate) =>
                new Promise<void>((done, fail) => {
                  if (events.some(predicate)) {
                    done();
                    return;
                  }
                  const timeout = setTimeout(
                    () => fail(new Error('Timed out waiting for event')),
                    5_000,
                  );
                  waiters.push({
                    predicate,
                    done: () => {
                      clearTimeout(timeout);
                      done();
                    },
                  });
                }),
              close: () => req.destroy(),
            });
          },
        );
        req.on('error', (error) => {
          if (!('code' in error) || error.code !== 'ECONNRESET') {
            reject(error);
          }
        });
        req.end();
      });
    }

    it('streams new and updated orders to staff of that restaurant only', async () => {
      const stream = await openStream(kitchen);
      const scoped = await openStream(branchStaff);
      const foreign = await openStream(stranger, other.id);
      try {
        expect(stream.status).toBe(200);
        await stream.waitFor((event) => event.event === 'ready');

        const placed = await placeOrder();
        await stream.waitFor(
          (event) => event.event === 'order' && event.data.includes(placed.orderId),
        );
        const created = stream.events.find((event) => event.data.includes(placed.orderId));
        expect(JSON.parse(created?.data ?? '{}')).toMatchObject({
          type: 'order.created',
          orderNumber: placed.orderNumber,
          status: 'PENDING',
        });

        await moveOk(owner, placed.orderId, 'PENDING', 'CONFIRMED');
        await stream.waitFor(
          (event) => event.data.includes(placed.orderId) && event.data.includes('CONFIRMED'),
        );

        const foreignOrder = await placeOrder({ target: other });
        await foreign.waitFor((event) => event.data.includes(foreignOrder.orderId));
        expect(stream.events.some((event) => event.data.includes(foreignOrder.orderId))).toBe(
          false,
        );
        expect(foreign.events.some((event) => event.data.includes(placed.orderId))).toBe(false);
        expect(scoped.events.some((event) => event.data.includes(placed.orderId))).toBe(false);
      } finally {
        stream.close();
        scoped.close();
        foreign.close();
      }
    });

    it('accepts a reconnect and refuses members without order access', async () => {
      const first = await openStream(owner);
      await first.waitFor((event) => event.event === 'ready');
      first.close();
      const second = await openStream(owner);
      await second.waitFor((event) => event.event === 'ready');
      const placed = await placeOrder();
      await second.waitFor((event) => event.data.includes(placed.orderId));
      second.close();

      const rider = await openStream(riderMember);
      expect(rider.status).toBe(403);
      rider.close();
      const outsider = await openStream(stranger);
      expect(outsider.status).toBe(404);
      outsider.close();
    });
  });
});
