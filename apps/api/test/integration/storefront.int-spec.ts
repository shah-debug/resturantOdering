import {
  addOnGroupSchema,
  apiErrorResponseSchema,
  branchSchema,
  categorySchema,
  productDetailSchema,
  type Storefront,
  storefrontDirectorySchema,
  storefrontSchema,
} from '@app/contracts';
import request from 'supertest';
import {
  API,
  type Client,
  createHarness,
  type Harness,
  registerUser,
} from '../support/auth-harness';

const BRANCH = {
  name: 'Gulberg',
  phone: '+924235000000',
  addressLine: '12 Main Boulevard',
  area: 'Gulberg III',
  city: 'Lahore',
};

interface Restaurant {
  organizationId: string;
  slug: string;
  menu: string;
  categoryId: string;
  productId: string;
  variantIds: string[];
  groupId: string;
  addOnIds: string[];
}

describe('public storefront (in-memory Postgres)', () => {
  let harness: Harness;
  let owner: Client;
  let tikka: Restaurant;
  let tikkaTwo: Restaurant;

  beforeAll(async () => {
    harness = await createHarness();
    ({ client: owner } = await registerUser(harness, 'storefront-owner'));
    tikka = await createRestaurant('tikka-house', 'Tikka House', 'Chicken Tikka');
    tikkaTwo = await createRestaurant('tikka-house-2', 'Tikka House Two', 'Seekh Kabab');
  });

  afterAll(async () => {
    await harness.close();
  });

  function publicGet(path: string) {
    return request(harness.app.getHttpServer()).get(`${API}/storefront/restaurants${path}`);
  }

  async function storefront(slug: string): Promise<Storefront> {
    return storefrontSchema.parse((await publicGet(`/${slug}`).expect(200)).body);
  }

  async function createRestaurant(slug: string, name: string, dish: string): Promise<Restaurant> {
    const organizationId = (
      (await owner.post('/organizations', { name, slug }).expect(201)).body as { id: string }
    ).id;
    const base = `/organizations/${organizationId}`;
    await owner
      .patch(base, {
        description: `${name} grills fresh tikka over charcoal every evening.`,
        contactPhone: '+923001234567',
        contactEmail: 'owner-private@example.com',
      })
      .expect(200);
    const branch = branchSchema.parse(
      (await owner.post(`${base}/branches`, BRANCH).expect(201)).body,
    );
    await owner
      .put(`${base}/branches/${branch.id}/opening-hours`, {
        intervals: [{ dayOfWeek: 1, opensAt: '12:00', closesAt: '23:00' }],
      })
      .expect(200);
    await owner
      .put(`${base}/branches/${branch.id}/fulfillment`, {
        deliveryEnabled: true,
        pickupEnabled: true,
        preparationMinutes: 25,
        delivery: { feeMinor: 15_000, minimumOrderMinor: 80_000, estimatedMinutes: 40 },
      })
      .expect(200);

    const menu = `${base}/menu`;
    const categoryId = categorySchema.parse(
      (await owner.post(`${menu}/categories`, { name: 'Grill' }).expect(201)).body,
    ).id;
    const group = addOnGroupSchema.parse(
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
    const product = productDetailSchema.parse(
      (
        await owner
          .post(`${menu}/products`, {
            categoryId,
            name: dish,
            description: 'Marinated overnight and grilled to order.',
            status: 'PUBLISHED',
            isAvailable: true,
            variants: [
              {
                name: 'Half',
                priceMinor: 90_000,
                isAvailable: true,
                isDefault: true,
                sku: `${slug}-H`,
              },
              { name: 'Full', priceMinor: 170_000, isAvailable: true, isDefault: false },
            ],
            addOnGroupIds: [group.id],
          })
          .expect(201)
      ).body,
    );
    await owner.post(`${base}/onboarding/complete`).expect(200);
    return {
      organizationId,
      slug,
      menu,
      categoryId,
      productId: product.id,
      variantIds: product.variants.map((variant) => variant.id),
      groupId: group.id,
      addOnIds: group.addOns.map((addOn) => addOn.id),
    };
  }

  describe('resolving a slug', () => {
    it('serves the published restaurant without a session', async () => {
      const response = await publicGet('/tikka-house').expect(200);
      expect(response.headers['cache-control']).toBe('public, max-age=30');
      const body = storefrontSchema.parse(response.body);
      expect(body).toMatchObject({
        slug: 'tikka-house',
        name: 'Tikka House',
        currency: 'PKR',
        timezone: 'Asia/Karachi',
      });
      expect(body.branches).toEqual([
        expect.objectContaining({
          name: 'Gulberg',
          city: 'Lahore',
          pickupEnabled: true,
          delivery: { feeMinor: 15_000, minimumOrderMinor: 80_000, estimatedMinutes: 40 },
          openingHours: [{ dayOfWeek: 1, opensAt: '12:00', closesAt: '23:00' }],
        }),
      ]);
      const [category] = body.categories;
      expect(category?.products.map((product) => product.name)).toEqual(['Chicken Tikka']);
      expect(category?.products[0]?.addOnGroups[0]).toMatchObject({
        name: 'Bread',
        minSelect: 1,
        maxSelect: 1,
      });
    });

    it('does not expose private fields', async () => {
      const raw = JSON.stringify((await publicGet('/tikka-house').expect(200)).body);
      for (const field of [
        'organizationId',
        'contactEmail',
        'contactPhone',
        'owner-private@example.com',
        '+923001234567',
        'legalName',
        'ntn',
        'sku',
        'imageKey',
        'status',
        'createdAt',
        'archivedAt',
        tikka.organizationId,
        'tikka-house-H',
      ]) {
        expect(raw).not.toContain(field);
      }
    });

    it('keeps similarly named restaurants and their menus apart', async () => {
      const one = await storefront('tikka-house');
      const two = await storefront('tikka-house-2');
      expect(two.name).toBe('Tikka House Two');

      const ids = (front: Storefront) =>
        front.categories.flatMap((category) => [
          category.id,
          ...category.products.flatMap((product) => [
            product.id,
            ...product.variants.map((variant) => variant.id),
            ...product.addOnGroups.flatMap((group) => [
              group.id,
              ...group.addOns.map((addOn) => addOn.id),
            ]),
          ]),
        ]);
      expect(ids(one)).toContain(tikka.productId);
      expect(ids(one)).not.toContain(tikkaTwo.productId);
      expect(ids(two)).toContain(tikkaTwo.productId);
      expect(ids(one).filter((id) => ids(two).includes(id))).toEqual([]);
    });

    it('rejects a second restaurant with a taken slug', async () => {
      await owner.post('/organizations', { name: 'Copycat', slug: 'tikka-house' }).expect(409);
      expect((await storefront('tikka-house')).name).toBe('Tikka House');
    });

    it('only matches the exact lowercase slug', async () => {
      await publicGet('/Tikka-House').expect(404);
      await publicGet('/tikka-hous').expect(404);
      await publicGet('/tikka-house-').expect(404);
      await publicGet('/tikka%20house').expect(404);
    });
  });

  describe('unavailable restaurants', () => {
    async function expectUniformNotFound(slug: string) {
      const response = await publicGet(`/${slug}`).expect(404);
      expect(apiErrorResponseSchema.parse(response.body)).toMatchObject({
        code: 'NOT_FOUND',
        message: 'Restaurant not found',
      });
      return response.body as Record<string, unknown>;
    }

    it('returns the same 404 for unknown, unpublished, suspended and closed restaurants', async () => {
      const unknown = await expectUniformNotFound('no-such-kitchen');

      await owner
        .post('/organizations', { name: 'Draft Kitchen', slug: 'draft-kitchen' })
        .expect(201);
      const draft = await expectUniformNotFound('draft-kitchen');

      await harness.prisma.organization.update({
        where: { id: tikkaTwo.organizationId },
        data: { status: 'SUSPENDED' },
      });
      const suspended = await expectUniformNotFound('tikka-house-2');

      await harness.prisma.organization.update({
        where: { id: tikkaTwo.organizationId },
        data: { status: 'CLOSED' },
      });
      const closed = await expectUniformNotFound('tikka-house-2');

      const strip = (body: Record<string, unknown>) => ({
        code: body.code,
        message: body.message,
        statusCode: body.statusCode,
        details: body.details,
      });
      expect(strip(draft)).toEqual(strip(unknown));
      expect(strip(suspended)).toEqual(strip(unknown));
      expect(strip(closed)).toEqual(strip(unknown));

      const directory = storefrontDirectorySchema.parse((await publicGet('').expect(200)).body);
      expect(directory.map((entry) => entry.slug)).toEqual(['tikka-house']);

      await harness.prisma.organization.update({
        where: { id: tikkaTwo.organizationId },
        data: { status: 'ACTIVE' },
      });
      expect((await storefront('tikka-house-2')).name).toBe('Tikka House Two');
    });

    it('lists only published restaurants in the directory', async () => {
      const directory = storefrontDirectorySchema.parse((await publicGet('').expect(200)).body);
      expect(directory.map((entry) => entry.slug)).toEqual(['tikka-house', 'tikka-house-2']);
    });
  });

  describe('menu visibility and availability', () => {
    function product(front: Storefront) {
      return front.categories
        .flatMap((category) => category.products)
        .find((item) => item.id === tikka.productId);
    }

    it('reflects availability changes immediately', async () => {
      await owner
        .patch(`${tikka.menu}/products/${tikka.productId}`, { isAvailable: false })
        .expect(200);
      expect(product(await storefront('tikka-house'))?.isAvailable).toBe(false);

      await owner
        .patch(`${tikka.menu}/products/${tikka.productId}`, { isAvailable: true })
        .expect(200);
      expect(product(await storefront('tikka-house'))?.isAvailable).toBe(true);
    });

    it('marks a sold-out option and a product whose required extras are sold out', async () => {
      const [half, full] = tikka.variantIds;
      await owner
        .put(`${tikka.menu}/products/${tikka.productId}`, {
          categoryId: tikka.categoryId,
          name: 'Chicken Tikka',
          description: 'Marinated overnight and grilled to order.',
          status: 'PUBLISHED',
          isAvailable: true,
          variants: [
            { id: half, name: 'Half', priceMinor: 95_000, isAvailable: true, isDefault: true },
            { id: full, name: 'Full', priceMinor: 170_000, isAvailable: false, isDefault: false },
          ],
          addOnGroupIds: [tikka.groupId],
        })
        .expect(200);
      const updated = product(await storefront('tikka-house'));
      expect(updated?.variants).toEqual([
        expect.objectContaining({ name: 'Half', priceMinor: 95_000, isAvailable: true }),
        expect.objectContaining({ name: 'Full', isAvailable: false }),
      ]);
      expect(updated?.isAvailable).toBe(true);

      await harness.prisma.addOn.updateMany({
        where: { addOnGroupId: tikka.groupId },
        data: { isAvailable: false },
      });
      expect(product(await storefront('tikka-house'))?.isAvailable).toBe(false);
      await harness.prisma.addOn.updateMany({
        where: { addOnGroupId: tikka.groupId },
        data: { isAvailable: true },
      });
    });

    it('hides draft and archived products and hidden or empty categories', async () => {
      await owner
        .patch(`${tikka.menu}/products/${tikka.productId}`, { status: 'DRAFT' })
        .expect(200);
      expect((await storefront('tikka-house')).categories).toEqual([]);
      await owner
        .patch(`${tikka.menu}/products/${tikka.productId}`, { status: 'PUBLISHED' })
        .expect(200);

      await owner
        .patch(`${tikka.menu}/categories/${tikka.categoryId}`, { isActive: false })
        .expect(200);
      expect((await storefront('tikka-house')).categories).toEqual([]);
      await owner
        .patch(`${tikka.menu}/categories/${tikka.categoryId}`, { isActive: true })
        .expect(200);

      await owner.delete(`${tikka.menu}/products/${tikka.productId}`).expect(204);
      expect((await storefront('tikka-house')).categories).toEqual([]);
      expect((await storefront('tikka-house-2')).categories).toHaveLength(1);
    });

    it('omits delivery when the branch turns it off and hides inactive branches', async () => {
      const branchId = (
        await harness.prisma.branch.findFirstOrThrow({
          where: { organizationId: tikkaTwo.organizationId },
        })
      ).id;
      await owner
        .put(`/organizations/${tikkaTwo.organizationId}/branches/${branchId}/fulfillment`, {
          deliveryEnabled: false,
          pickupEnabled: true,
          preparationMinutes: 25,
          delivery: null,
        })
        .expect(200);
      expect((await storefront('tikka-house-2')).branches[0]?.delivery).toBeNull();

      await harness.prisma.branch.update({ where: { id: branchId }, data: { status: 'INACTIVE' } });
      expect((await storefront('tikka-house-2')).branches).toEqual([]);
    });
  });
});
