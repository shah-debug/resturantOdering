import { randomUUID } from 'node:crypto';
import {
  addOnGroupSchema,
  apiErrorResponseSchema,
  branchSchema,
  categorySchema,
  type CheckoutQuote,
  checkoutQuoteSchema,
  orderTrackingSchema,
  placedOrderSchema,
  productDetailSchema,
} from '@app/contracts';
import request from 'supertest';
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

const PHONE = '+923001234567';

interface Restaurant {
  organizationId: string;
  slug: string;
  branchId: string;
  menu: string;
  karahiId: string;
  halfId: string;
  fullId: string;
  naanId: string;
  roghniId: string;
  breadGroupId: string;
  raitaId: string;
  extrasGroupId: string;
  lassiId: string;
  lassiVariantId: string;
}

function code(body: unknown): string | undefined {
  return apiErrorResponseSchema.safeParse(body).data?.code;
}

function fields(body: unknown): string[] {
  return apiErrorResponseSchema.parse(body).details?.map((detail) => detail.field) ?? [];
}

describe('guest checkout (in-memory Postgres)', () => {
  let harness: Harness;
  let owner: Client;
  let karahi: Restaurant;
  let other: Restaurant;

  beforeAll(async () => {
    harness = await createHarness();
    ({ client: owner } = await registerUser(harness, 'checkout-owner'));
    karahi = await createRestaurant('karahi-corner');
    other = await createRestaurant('other-corner');
  });

  afterAll(async () => {
    await harness.close();
  });

  async function createRestaurant(slug: string): Promise<Restaurant> {
    const organizationId = (
      (await owner.post('/organizations', { name: `${slug} kitchen`, slug }).expect(201)).body as {
        id: string;
      }
    ).id;
    const base = `/organizations/${organizationId}`;
    await owner
      .patch(base, {
        description: 'Charcoal karahi and fresh naan, cooked to order.',
        contactPhone: '+923111111111',
      })
      .expect(200);
    const branch = branchSchema.parse(
      (
        await owner
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
    await owner
      .put(`${base}/branches/${branch.id}/opening-hours`, { intervals: ALL_DAY })
      .expect(200);
    await owner
      .put(`${base}/branches/${branch.id}/fulfillment`, {
        deliveryEnabled: true,
        pickupEnabled: true,
        preparationMinutes: 20,
        delivery: { feeMinor: 15_000, minimumOrderMinor: 80_000, estimatedMinutes: 40 },
      })
      .expect(200);

    const menu = `${base}/menu`;
    const grill = categorySchema.parse(
      (await owner.post(`${menu}/categories`, { name: 'Karahi' }).expect(201)).body,
    ).id;
    const bread = addOnGroupSchema.parse(
      (
        await owner
          .post(`${menu}/add-on-groups`, {
            name: 'Bread',
            minSelect: 1,
            maxSelect: 1,
            addOns: [
              { name: 'Naan', priceMinor: 5_000, isAvailable: true },
              { name: 'Roghni Naan', priceMinor: 8_000, isAvailable: true },
            ],
          })
          .expect(201)
      ).body,
    );
    const extras = addOnGroupSchema.parse(
      (
        await owner
          .post(`${menu}/add-on-groups`, {
            name: 'Extras',
            minSelect: 0,
            maxSelect: 2,
            addOns: [
              { name: 'Raita', priceMinor: 6_000, isAvailable: true },
              { name: 'Salad', priceMinor: 4_000, isAvailable: true },
            ],
          })
          .expect(201)
      ).body,
    );
    const karahiProduct = productDetailSchema.parse(
      (
        await owner
          .post(`${menu}/products`, {
            categoryId: grill,
            name: 'Chicken Karahi',
            status: 'PUBLISHED',
            isAvailable: true,
            variants: [
              { name: 'Half', priceMinor: 145_000, isAvailable: true, isDefault: true },
              { name: 'Full', priceMinor: 270_000, isAvailable: true, isDefault: false },
            ],
            addOnGroupIds: [bread.id],
          })
          .expect(201)
      ).body,
    );
    const lassi = productDetailSchema.parse(
      (
        await owner
          .post(`${menu}/products`, {
            categoryId: grill,
            name: 'Sweet Lassi',
            status: 'PUBLISHED',
            isAvailable: true,
            variants: [{ name: 'Regular', priceMinor: 35_000, isAvailable: true, isDefault: true }],
            addOnGroupIds: [],
          })
          .expect(201)
      ).body,
    );
    await owner.post(`${base}/onboarding/complete`).expect(200);
    const naan = bread.addOns.find((addOn) => addOn.name === 'Naan');
    const roghni = bread.addOns.find((addOn) => addOn.name === 'Roghni Naan');
    return {
      organizationId,
      slug,
      branchId: branch.id,
      menu,
      karahiId: karahiProduct.id,
      halfId: karahiProduct.variants[0]?.id ?? '',
      fullId: karahiProduct.variants[1]?.id ?? '',
      naanId: naan?.id ?? '',
      roghniId: roghni?.id ?? '',
      breadGroupId: bread.id,
      raitaId: extras.addOns[0]?.id ?? '',
      extrasGroupId: extras.id,
      lassiId: lassi.id,
      lassiVariantId: lassi.variants[0]?.id ?? '',
    };
  }

  function cart(restaurant: Restaurant = karahi) {
    return [
      {
        productId: restaurant.karahiId,
        variantId: restaurant.halfId,
        addOnIds: [restaurant.naanId],
        quantity: 2,
      },
      {
        productId: restaurant.lassiId,
        variantId: restaurant.lassiVariantId,
        addOnIds: [],
        quantity: 1,
      },
    ];
  }

  function deliveryBody(overrides: Record<string, unknown> = {}) {
    return {
      branchId: karahi.branchId,
      fulfillment: {
        type: 'DELIVERY',
        address: { addressLine: '45 Canal View Road', area: 'Model Town', city: 'Lahore' },
        instructions: 'Ring the bell twice',
      },
      paymentMethod: 'CASH',
      items: cart(),
      ...overrides,
    };
  }

  function pickupBody(overrides: Record<string, unknown> = {}) {
    return deliveryBody({ fulfillment: { type: 'PICKUP' }, ...overrides });
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

  async function quote(body: object, slug = karahi.slug): Promise<CheckoutQuote> {
    return checkoutQuoteSchema.parse(
      (await publicPost(`/${slug}/checkout/quote`, body).expect(200)).body,
    );
  }

  async function placeBody(body: Record<string, unknown>, slug = karahi.slug) {
    const priced = await quote(body, slug);
    return {
      ...body,
      customer: { name: 'Ayesha Khan', phone: PHONE },
      note: 'Less spicy please',
      expectedTotalMinor: priced.totals?.totalMinor ?? 0,
    };
  }

  function place(body: object, key: string = randomUUID(), slug = karahi.slug) {
    return publicPost(`/${slug}/orders`, body, { 'Idempotency-Key': key });
  }

  function orderCount(organizationId = karahi.organizationId) {
    return harness.prisma.order.count({ where: { organizationId } });
  }

  function track(orderId: string, token: string | null, slug = karahi.slug) {
    const req = request(harness.app.getHttpServer()).get(
      `${API}/storefront/restaurants/${slug}/orders/${orderId}`,
    );
    return token ? req.set('X-Order-Token', token) : req;
  }

  describe('quotes', () => {
    it('prices delivery and pickup from the current menu', async () => {
      const delivery = await quote(deliveryBody());
      expect(delivery).toMatchObject({
        canPlaceOrder: true,
        issues: [],
        paymentMethods: ['CASH'],
        estimatedMinutes: 40,
        totals: {
          subtotalMinor: (145_000 + 5_000) * 2 + 35_000,
          deliveryFeeMinor: 15_000,
          discountMinor: 0,
          taxMinor: 0,
          totalMinor: 350_000,
        },
      });
      expect(delivery.lines[0]).toMatchObject({
        productName: 'Chicken Karahi',
        variantName: 'Half',
        unitPriceMinor: 145_000,
        addOnsTotalMinor: 5_000,
        lineSubtotalMinor: 300_000,
        addOns: [expect.objectContaining({ name: 'Naan', groupName: 'Bread' })],
      });

      const pickup = await quote(pickupBody());
      expect(pickup.totals).toMatchObject({ deliveryFeeMinor: 0, totalMinor: 335_000 });
      expect(pickup.estimatedMinutes).toBe(20);
    });

    it('applies branch tax and rounds cash totals to whole rupees', async () => {
      await harness.prisma.branch.update({
        where: { id: karahi.branchId },
        data: { taxRateBps: 1_650 },
      });
      try {
        const priced = await quote(
          pickupBody({
            items: [
              {
                productId: karahi.lassiId,
                variantId: karahi.lassiVariantId,
                addOnIds: [],
                quantity: 1,
              },
            ],
          }),
        );
        expect(priced.totals).toMatchObject({
          subtotalMinor: 35_000,
          taxMinor: 5_775,
          roundingAdjustmentMinor: 25,
          totalMinor: 40_800,
        });
      } finally {
        await harness.prisma.branch.update({
          where: { id: karahi.branchId },
          data: { taxRateBps: 0 },
        });
      }
    });

    it('rejects unknown fields such as client-supplied prices', async () => {
      const tampered = deliveryBody({
        items: [{ ...cart()[0], unitPriceMinor: 1 }],
        totalMinor: 1,
      });
      const response = await publicPost(`/${karahi.slug}/checkout/quote`, tampered).expect(400);
      expect(code(response.body)).toBe('VALIDATION_FAILED');
    });

    it('returns 404 for restaurants that are not published', async () => {
      await publicPost('/no-such-place/checkout/quote', deliveryBody()).expect(404);
    });
  });

  describe('placing an order', () => {
    it('creates the order, snapshots, history and an unpaid COD payment in one go', async () => {
      const body = await placeBody(deliveryBody());
      const response = await place(body).expect(201);
      const placed = placedOrderSchema.parse(response.body);
      expect(placed.totalMinor).toBe(350_000);

      const order = await harness.prisma.order.findUniqueOrThrow({
        where: { id: placed.orderId },
        include: {
          items: { include: { addOns: true }, orderBy: { createdAt: 'asc' } },
          statusHistory: true,
          payments: true,
          customer: true,
        },
      });
      expect(order).toMatchObject({
        organizationId: karahi.organizationId,
        orderNumber: placed.orderNumber,
        type: 'DELIVERY',
        channel: 'STOREFRONT',
        status: 'PENDING',
        paymentMethod: 'CASH',
        paymentStatus: 'UNPAID',
        subtotalMinor: 335_000,
        deliveryFeeMinor: 15_000,
        totalMinor: 350_000,
        customerName: 'Ayesha Khan',
        customerPhone: PHONE,
        deliveryAddressLine: '45 Canal View Road',
        deliveryArea: 'Model Town',
        deliveryCity: 'Lahore',
        deliveryInstructions: 'Ring the bell twice',
        customerNote: 'Less spicy please',
      });
      expect(order.items).toHaveLength(2);
      const karahiItem = order.items.find((item) => item.productName === 'Chicken Karahi');
      expect(karahiItem).toMatchObject({
        productName: 'Chicken Karahi',
        variantName: 'Half',
        unitPriceMinor: 145_000,
        addOnsTotalMinor: 5_000,
        quantity: 2,
        lineSubtotalMinor: 300_000,
      });
      expect(karahiItem?.addOns).toEqual([
        expect.objectContaining({ name: 'Naan', groupName: 'Bread', unitPriceMinor: 5_000 }),
      ]);
      expect(order.statusHistory).toEqual([
        expect.objectContaining({ fromStatus: null, toStatus: 'PENDING', actorType: 'CUSTOMER' }),
      ]);
      expect(order.payments).toEqual([
        expect.objectContaining({
          method: 'CASH',
          status: 'PENDING',
          amountMinor: 350_000,
          paidAt: null,
        }),
      ]);
      expect(order.customer).toMatchObject({ phone: PHONE, fullName: 'Ayesha Khan' });

      const tracking = orderTrackingSchema.parse(
        (await track(placed.orderId, placed.trackingToken).expect(200)).body,
      );
      expect(tracking).toMatchObject({
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        customerPhone: '+92300••••567',
        canCancel: true,
        totals: { totalMinor: 350_000 },
      });
    });

    it('numbers orders per restaurant', async () => {
      const first = placedOrderSchema.parse(
        (await place(await placeBody(pickupBody())).expect(201)).body,
      );
      const second = placedOrderSchema.parse(
        (await place(await placeBody(pickupBody())).expect(201)).body,
      );
      expect(second.orderNumber).toBe(first.orderNumber + 1);
      const elsewhere = placedOrderSchema.parse(
        (
          await place(
            await placeBody(
              pickupBody({ branchId: other.branchId, items: cart(other) }),
              other.slug,
            ),
            randomUUID(),
            other.slug,
          ).expect(201)
        ).body,
      );
      expect(elsewhere.orderNumber).toBe(1);
    });

    it('rejects a total that does not match the server price', async () => {
      const body = await placeBody(deliveryBody());
      const before = await orderCount();
      const response = await place({ ...body, expectedTotalMinor: 100 }).expect(409);
      expect(code(response.body)).toBe('PRICE_CHANGED');
      expect(await orderCount()).toBe(before);
    });

    it('rejects client-supplied prices and totals outright', async () => {
      const body = await placeBody(deliveryBody());
      await place({ ...body, items: [{ ...cart()[0], unitPriceMinor: 1 }] }).expect(400);
      await place({ ...body, totalMinor: 1 }).expect(400);
      await place({ ...body, paymentStatus: 'PAID' }).expect(400);
    });

    it('validates customer details and requires an idempotency key', async () => {
      const body = await placeBody(pickupBody());
      expect(
        fields(
          (await place({ ...body, customer: { name: 'A', phone: '03001234567' } }).expect(400))
            .body,
        ),
      ).toEqual(expect.arrayContaining(['customer.name', 'customer.phone']));
      const missingKey = await publicPost(`/${karahi.slug}/orders`, body).expect(400);
      expect(fields(missingKey.body)).toEqual(['Idempotency-Key']);
      await place(body, 'short').expect(400);
    });

    it('requires a trusted origin', async () => {
      const body = await placeBody(pickupBody());
      const response = await request(harness.app.getHttpServer())
        .post(`${API}/storefront/restaurants/${karahi.slug}/orders`)
        .set('Origin', 'https://evil.example.com')
        .set('Idempotency-Key', randomUUID())
        .send(body)
        .expect(403);
      expect(code(response.body)).toBe('CSRF_REJECTED');
    });

    it('rejects payment methods that are not configured', async () => {
      const body = await placeBody(pickupBody());
      const response = await place({ ...body, paymentMethod: 'CARD' }).expect(422);
      expect(fields(response.body)).toEqual(['paymentMethod']);
    });
  });

  describe('invalid items', () => {
    async function expectRejected(items: object[], field = 'items.0') {
      const body = await placeBody(pickupBody());
      const before = await orderCount();
      const response = await place({ ...body, items }).expect(422);
      expect(code(response.body)).toBe('CHECKOUT_REJECTED');
      expect(fields(response.body)).toContain(field);
      expect(await orderCount()).toBe(before);
    }

    const line = () => ({
      productId: karahi.karahiId,
      variantId: karahi.halfId,
      addOnIds: [karahi.naanId],
      quantity: 1,
    });

    it('rejects missing, extra or duplicated required choices', async () => {
      await expectRejected([{ ...line(), addOnIds: [] }]);
      await expectRejected([{ ...line(), addOnIds: [karahi.naanId, karahi.roghniId] }]);
      await expectRejected([{ ...line(), addOnIds: [karahi.raitaId, karahi.naanId] }]);
      await place({
        ...(await placeBody(pickupBody())),
        items: [{ ...line(), addOnIds: [karahi.naanId, karahi.naanId] }],
      }).expect(400);
    });

    it('rejects a variant of another product', async () => {
      await expectRejected([{ ...line(), variantId: karahi.lassiVariantId }]);
    });

    it('rejects item ids from another restaurant', async () => {
      await expectRejected([
        { ...line(), productId: other.karahiId, variantId: other.halfId, addOnIds: [other.naanId] },
      ]);
      await expectRejected([{ ...line(), addOnIds: [other.naanId] }]);
      await expectRejected([{ ...line(), variantId: other.halfId }]);
    });

    it('rejects a branch from another restaurant', async () => {
      const body = await placeBody(pickupBody());
      const response = await place({ ...body, branchId: other.branchId }).expect(422);
      expect(fields(response.body)).toContain('branchId');
    });

    it('rejects unknown ids', async () => {
      await expectRejected([{ ...line(), productId: randomUUID() }]);
    });
  });

  describe('availability changes between quote and order', () => {
    it('rejects a product that sold out after the customer saw it', async () => {
      const body = await placeBody(pickupBody());
      await owner
        .patch(`${karahi.menu}/products/${karahi.lassiId}`, { isAvailable: false })
        .expect(200);
      try {
        const before = await orderCount();
        const lastNumber = (
          await harness.prisma.organization.findUniqueOrThrow({
            where: { id: karahi.organizationId },
          })
        ).lastOrderNumber;
        const response = await place(body).expect(422);
        expect(fields(response.body)).toEqual(['items.1']);
        expect(await orderCount()).toBe(before);
        expect(
          (
            await harness.prisma.organization.findUniqueOrThrow({
              where: { id: karahi.organizationId },
            })
          ).lastOrderNumber,
        ).toBe(lastNumber);
      } finally {
        await owner
          .patch(`${karahi.menu}/products/${karahi.lassiId}`, { isAvailable: true })
          .expect(200);
      }
    });

    it('rejects an add-on that sold out and a price that changed', async () => {
      const body = await placeBody(pickupBody());
      await harness.prisma.addOn.update({
        where: { id: karahi.naanId },
        data: { isAvailable: false },
      });
      await place(body).expect(422);
      await harness.prisma.addOn.update({
        where: { id: karahi.naanId },
        data: { isAvailable: true },
      });

      await harness.prisma.productVariant.update({
        where: { id: karahi.halfId },
        data: { priceMinor: 150_000 },
      });
      try {
        const response = await place(body).expect(409);
        expect(code(response.body)).toBe('PRICE_CHANGED');
        const fresh = await quote(pickupBody());
        expect(fresh.totals?.subtotalMinor).toBe((150_000 + 5_000) * 2 + 35_000);
      } finally {
        await harness.prisma.productVariant.update({
          where: { id: karahi.halfId },
          data: { priceMinor: 145_000 },
        });
      }
    });

    it('rejects orders while the restaurant is not accepting them', async () => {
      const body = await placeBody(pickupBody());
      await harness.prisma.branch.update({
        where: { id: karahi.branchId },
        data: { isAcceptingOrders: false },
      });
      try {
        const priced = await quote(pickupBody());
        expect(priced.canPlaceOrder).toBe(false);
        expect(priced.issues.map((item) => item.code)).toEqual(['STORE_CLOSED']);
        await place(body).expect(422);
      } finally {
        await harness.prisma.branch.update({
          where: { id: karahi.branchId },
          data: { isAcceptingOrders: true },
        });
      }
    });

    it('rejects orders outside opening hours', async () => {
      await harness.prisma.branchOpeningHours.deleteMany({ where: { branchId: other.branchId } });
      const priced = await quote(
        pickupBody({ branchId: other.branchId, items: cart(other) }),
        other.slug,
      );
      expect(priced.issues).toEqual([
        { code: 'STORE_CLOSED', field: 'branchId', message: 'This restaurant is closed right now' },
      ]);
      await owner
        .put(`/organizations/${other.organizationId}/branches/${other.branchId}/opening-hours`, {
          intervals: ALL_DAY,
        })
        .expect(200);
    });
  });

  describe('idempotency', () => {
    it('returns the same order for a repeated submission', async () => {
      const body = await placeBody(pickupBody());
      const key = randomUUID();
      const before = await orderCount();
      const first = placedOrderSchema.parse((await place(body, key).expect(201)).body);
      const again = await place(body, key).expect(200);
      expect(again.headers['idempotent-replayed']).toBe('true');
      expect(placedOrderSchema.parse(again.body)).toEqual(first);
      expect(await orderCount()).toBe(before + 1);
    });

    it('creates one order for simultaneous duplicate submissions', async () => {
      const body = await placeBody(pickupBody());
      const key = randomUUID();
      const before = await orderCount();
      const responses = await Promise.all([place(body, key), place(body, key), place(body, key)]);
      const ids = new Set(
        responses.map((response) => placedOrderSchema.parse(response.body).orderId),
      );
      expect(ids.size).toBe(1);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 201]);
      expect(await orderCount()).toBe(before + 1);
    });

    it('refuses to reuse a key for a different order', async () => {
      const body = await placeBody(pickupBody());
      const key = randomUUID();
      await place(body, key).expect(201);
      const response = await place({ ...body, note: 'Changed my mind' }, key).expect(409);
      expect(code(response.body)).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('scopes keys to the restaurant', async () => {
      const key = randomUUID();
      await place(await placeBody(pickupBody()), key).expect(201);
      await place(
        await placeBody(pickupBody({ branchId: other.branchId, items: cart(other) }), other.slug),
        key,
        other.slug,
      ).expect(201);
    });
  });

  describe('delivery areas and minimums', () => {
    beforeAll(async () => {
      await harness.prisma.branch.update({
        where: { id: karahi.branchId },
        data: { latitude: 31.5204, longitude: 74.3587 },
      });
      const express = await harness.prisma.deliveryZone.create({
        data: {
          organizationId: karahi.organizationId,
          branchId: karahi.branchId,
          name: 'Gulberg express',
          feeMinor: 5_000,
          minOrderMinor: 50_000,
          estimatedMinutes: 25,
        },
      });
      await harness.prisma.deliveryZoneArea.createMany({
        data: ['Gulberg III', 'Main Market'].map((name) => ({
          organizationId: karahi.organizationId,
          deliveryZoneId: express.id,
          name,
        })),
      });
      await harness.prisma.deliveryZone.create({
        data: {
          organizationId: karahi.organizationId,
          branchId: karahi.branchId,
          name: 'Next door',
          feeMinor: 0,
          minOrderMinor: 0,
          estimatedMinutes: 15,
          radiusMeters: 1_000,
        },
      });
    });

    function address(overrides: Record<string, unknown>) {
      return {
        fulfillment: {
          type: 'DELIVERY',
          address: {
            addressLine: '45 Canal View Road',
            area: 'Model Town',
            city: 'Lahore',
            ...overrides,
          },
        },
      };
    }

    it('uses the cheapest zone that covers the address', async () => {
      expect((await quote(deliveryBody(address({ area: ' gulberg iii ' })))).totals).toMatchObject({
        deliveryFeeMinor: 5_000,
      });
      expect((await quote(deliveryBody(address({})))).totals).toMatchObject({
        deliveryFeeMinor: 15_000,
      });
    });

    it('applies a radius zone only inside its boundary', async () => {
      const metersNorth = (meters: number) => ({
        latitude: Number((31.5204 + meters / 111_195).toFixed(6)),
        longitude: 74.3587,
      });
      const inside = await quote(deliveryBody(address(metersNorth(990))));
      expect(inside.totals?.deliveryFeeMinor).toBe(0);
      expect(inside.estimatedMinutes).toBe(15);
      const outside = await quote(deliveryBody(address(metersNorth(1_020))));
      expect(outside.totals?.deliveryFeeMinor).toBe(15_000);
    });

    it('rejects addresses outside every zone', async () => {
      const priced = await quote(deliveryBody(address({ city: 'Karachi', area: 'Clifton' })));
      expect(priced.issues.map((item) => item.code)).toEqual(['DELIVERY_UNAVAILABLE']);
      const body = await placeBody(deliveryBody(address({ city: 'Karachi', area: 'Clifton' })));
      const response = await place(body).expect(422);
      expect(fields(response.body)).toEqual(['fulfillment.address.area']);
    });

    it('enforces the zone minimum order for delivery only', async () => {
      const small = [
        { productId: karahi.lassiId, variantId: karahi.lassiVariantId, addOnIds: [], quantity: 1 },
      ];
      const priced = await quote(deliveryBody({ items: small }));
      expect(priced.issues.map((item) => item.code)).toEqual(['MINIMUM_ORDER_NOT_MET']);
      expect((await quote(pickupBody({ items: small }))).canPlaceOrder).toBe(true);
    });

    it('rejects delivery when the branch only offers pickup', async () => {
      await harness.prisma.branch.update({
        where: { id: karahi.branchId },
        data: { deliveryEnabled: false },
      });
      try {
        const priced = await quote(deliveryBody());
        expect(priced.issues.map((item) => item.code)).toEqual(['FULFILLMENT_UNAVAILABLE']);
      } finally {
        await harness.prisma.branch.update({
          where: { id: karahi.branchId },
          data: { deliveryEnabled: true },
        });
      }
    });
  });

  describe('promotions', () => {
    async function promotion(code: string, data: Record<string, unknown>) {
      await harness.prisma.promotion.create({
        data: {
          organizationId: karahi.organizationId,
          code,
          name: `${code} offer`,
          type: 'PERCENTAGE',
          startsAt: new Date(Date.now() - 60_000),
          ...data,
        },
      });
    }

    beforeAll(async () => {
      await promotion('TENOFF', { percentBps: 1_000, maxDiscountMinor: 20_000 });
      await promotion('FLAT500', { type: 'FIXED_AMOUNT', amountMinor: 50_000 });
      await promotion('FREEDEL', { type: 'FREE_DELIVERY' });
      await promotion('OLD', {
        percentBps: 1_000,
        endsAt: new Date(Date.now() - 1_000),
        startsAt: new Date(Date.now() - 60_000),
      });
      await promotion('ONCE', { type: 'FIXED_AMOUNT', amountMinor: 1_000, usageLimit: 1 });
      await promotion('MINE', { type: 'FIXED_AMOUNT', amountMinor: 1_000, perCustomerLimit: 1 });
      await promotion('BIGSPEND', {
        type: 'FIXED_AMOUNT',
        amountMinor: 1_000,
        minOrderMinor: 1_000_000,
      });
    });

    it('applies percentage, fixed and free-delivery codes', async () => {
      expect((await quote(deliveryBody({ promoCode: 'tenoff' }))).totals).toMatchObject({
        discountMinor: 20_000,
        totalMinor: 330_000,
      });
      expect((await quote(deliveryBody({ promoCode: 'FLAT500' }))).totals).toMatchObject({
        discountMinor: 50_000,
        totalMinor: 300_000,
      });
      expect((await quote(deliveryBody({ promoCode: 'FREEDEL' }))).totals).toMatchObject({
        deliveryDiscountMinor: 15_000,
        totalMinor: 335_000,
      });
    });

    it('stores the discount on the order and its items', async () => {
      const placed = placedOrderSchema.parse(
        (await place(await placeBody(deliveryBody({ promoCode: 'TENOFF' }))).expect(201)).body,
      );
      const order = await harness.prisma.order.findUniqueOrThrow({
        where: { id: placed.orderId },
        include: { items: true },
      });
      expect(order).toMatchObject({ discountMinor: 20_000, promotionCode: 'TENOFF' });
      expect(order.items.reduce((sum, item) => sum + item.discountMinor, 0)).toBe(20_000);
    });

    it('rejects expired, exhausted, per-customer and minimum-spend codes', async () => {
      const issue = async (promoCode: string, body = pickupBody()) =>
        (await quote({ ...body, promoCode })).issues.map((item) => item.message);
      expect(await issue('OLD')).toEqual(['This code has expired']);
      expect(await issue('NOPE')).toEqual(['This code isn’t valid']);
      expect(await issue('BIGSPEND')).toEqual(['Spend at least Rs 10,000 to use this code']);
      expect(await issue('FREEDEL')).toEqual(['This code only applies to delivery orders']);

      await place(await placeBody(pickupBody({ promoCode: 'ONCE' }))).expect(201);
      expect(await issue('ONCE')).toEqual(['This code has been fully redeemed']);

      await place(await placeBody(pickupBody({ promoCode: 'MINE' }))).expect(201);
      const again = await place(await placeBody(pickupBody({ promoCode: 'MINE' }))).expect(422);
      expect(apiErrorResponseSchema.parse(again.body).message).toBe(
        'You have already used this code',
      );
    });
  });

  describe('tracking and cancellation', () => {
    it('only shows an order with its own token and restaurant', async () => {
      const placed = placedOrderSchema.parse(
        (await place(await placeBody(pickupBody())).expect(201)).body,
      );
      const other404 = await track(placed.orderId, null).expect(404);
      expect(code(other404.body)).toBe('NOT_FOUND');
      await track(placed.orderId, 'A'.repeat(43)).expect(404);
      await track(placed.orderId, placed.trackingToken, other.slug).expect(404);
      await track(randomUUID(), placed.trackingToken).expect(404);
      await track('not-a-uuid', placed.trackingToken).expect(404);
      const response = await track(placed.orderId, placed.trackingToken).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const tracking = orderTrackingSchema.parse(response.body);
      expect(JSON.stringify(tracking)).not.toContain(PHONE);
    });

    it('lets the customer cancel a pending order once', async () => {
      const placed = placedOrderSchema.parse(
        (await place(await placeBody(pickupBody())).expect(201)).body,
      );
      const cancel = (token: string) =>
        publicPost(
          `/${karahi.slug}/orders/${placed.orderId}/cancel`,
          {},
          { 'X-Order-Token': token },
        );

      await cancel('B'.repeat(43)).expect(404);
      const cancelled = orderTrackingSchema.parse(
        (await cancel(placed.trackingToken).expect(200)).body,
      );
      expect(cancelled).toMatchObject({ status: 'CANCELLED', canCancel: false });
      expect(cancelled.timeline.map((entry) => entry.status)).toEqual(['PENDING', 'CANCELLED']);
      const payment = await harness.prisma.payment.findFirstOrThrow({
        where: { orderId: placed.orderId },
      });
      expect(payment.status).toBe('CANCELLED');
      const order = await harness.prisma.order.findUniqueOrThrow({ where: { id: placed.orderId } });
      expect(order).toMatchObject({ paymentStatus: 'UNPAID' });
      expect(order.cancelledAt).not.toBeNull();

      const again = await cancel(placed.trackingToken).expect(409);
      expect(code(again.body)).toBe('CONFLICT');
    });

    it('does not let the customer cancel once the restaurant has confirmed', async () => {
      const placed = placedOrderSchema.parse(
        (await place(await placeBody(pickupBody())).expect(201)).body,
      );
      await harness.prisma.$transaction([
        harness.prisma.order.update({
          where: { id: placed.orderId },
          data: { status: 'CONFIRMED' },
        }),
        harness.prisma.orderStatusHistory.create({
          data: {
            organizationId: karahi.organizationId,
            orderId: placed.orderId,
            fromStatus: 'PENDING',
            toStatus: 'CONFIRMED',
            actorType: 'STAFF',
          },
        }),
      ]);
      await publicPost(
        `/${karahi.slug}/orders/${placed.orderId}/cancel`,
        {},
        { 'X-Order-Token': placed.trackingToken },
      ).expect(409);
      const tracking = orderTrackingSchema.parse(
        (await track(placed.orderId, placed.trackingToken).expect(200)).body,
      );
      expect(tracking).toMatchObject({ status: 'CONFIRMED', canCancel: false });
    });
  });
});
