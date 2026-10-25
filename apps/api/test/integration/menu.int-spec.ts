import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addOnGroupSchema,
  apiErrorResponseSchema,
  categorySchema,
  MENU_LIMITS,
  paginatedSchema,
  productDetailSchema,
  productSummarySchema,
} from '@app/contracts';
import request from 'supertest';
import {
  addMember,
  type Client,
  createHarness,
  createOrganization,
  type Harness,
  registerUser,
} from '../support/auth-harness';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('IHDR-test-image-body'),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpeg-test-body')]);

function fields(body: unknown): string[] {
  return apiErrorResponseSchema.parse(body).details?.map((detail) => detail.field) ?? [];
}

function code(body: unknown): string | undefined {
  return apiErrorResponseSchema.safeParse(body).data?.code;
}

const productPage = paginatedSchema(productSummarySchema);

describe('menu management (in-memory Postgres)', () => {
  let harness: Harness;
  let uploads: string;
  let owner: Client;
  let organizationId: string;
  let menu: string;
  let karahiCategory: string;
  let spiceGroup: string;

  beforeAll(async () => {
    uploads = await mkdtemp(join(tmpdir(), 'menu-uploads-'));
    harness = await createHarness({ STORAGE_DRIVER: 'local', STORAGE_LOCAL_DIR: uploads });
    ({ client: owner } = await registerUser(harness, 'menu-owner'));
    organizationId = await createOrganization(owner, 'menu');
    menu = `/organizations/${organizationId}/menu`;
  });

  afterAll(async () => {
    await harness.close();
    await rm(uploads, { recursive: true, force: true });
  });

  async function createCategory(name: string): Promise<string> {
    const response = await owner.post(`${menu}/categories`, { name }).expect(201);
    return categorySchema.parse(response.body).id;
  }

  function productBody(overrides: Record<string, unknown> = {}) {
    return {
      categoryId: karahiCategory,
      name: 'Chicken Karahi',
      description: 'Slow-cooked in a wok with tomatoes and green chillies.',
      status: 'PUBLISHED',
      isAvailable: true,
      variants: [
        { name: 'Half', priceMinor: 145_000, isAvailable: true, isDefault: true },
        { name: 'Full', priceMinor: 270_000, isAvailable: true, isDefault: false, sku: 'KAR-FULL' },
      ],
      addOnGroupIds: [spiceGroup],
      ...overrides,
    };
  }

  describe('categories', () => {
    it('creates categories with derived slugs and validates names', async () => {
      karahiCategory = await createCategory('Karahi');
      const second = categorySchema.parse(
        (await owner.post(`${menu}/categories`, { name: 'Karahi' }).expect(201)).body,
      );
      expect(second.slug).toBe('karahi-2');
      await owner.post(`${menu}/categories`, { name: 'K' }).expect(400);
      await owner.delete(`${menu}/categories/${second.id}`).expect(204);
    });

    it('reorders categories and rejects incomplete orderings', async () => {
      const bbq = await createCategory('BBQ');
      const drinks = await createCategory('Drinks');
      await owner.put(`${menu}/categories/order`, { ids: [drinks, bbq] }).expect(400);
      const reordered = (
        await owner
          .put(`${menu}/categories/order`, { ids: [drinks, bbq, karahiCategory] })
          .expect(200)
      ).body as { id: string }[];
      expect(reordered.map((category) => category.id)).toEqual([drinks, bbq, karahiCategory]);
      const listed = (await owner.get(`${menu}/categories`).expect(200)).body as { id: string }[];
      expect(listed.map((category) => category.id)).toEqual([drinks, bbq, karahiCategory]);
    });
  });

  describe('customization groups', () => {
    it('validates selection limits, prices and option names', async () => {
      const base = {
        name: 'Extras',
        minSelect: 0,
        maxSelect: 2,
        addOns: [
          { name: 'Naan', priceMinor: 6_000, isAvailable: true },
          { name: 'Raita', priceMinor: 15_000, isAvailable: true },
        ],
      };
      expect(
        fields(
          (await owner.post(`${menu}/add-on-groups`, { ...base, minSelect: 3 }).expect(400)).body,
        ),
      ).toEqual(expect.arrayContaining(['minSelect']));
      expect(
        fields(
          (await owner.post(`${menu}/add-on-groups`, { ...base, maxSelect: 3 }).expect(400)).body,
        ),
      ).toEqual(['maxSelect']);
      expect(
        fields(
          (
            await owner
              .post(`${menu}/add-on-groups`, {
                ...base,
                addOns: [base.addOns[0], { ...base.addOns[0], name: ' naan ' }],
              })
              .expect(400)
          ).body,
        ),
      ).toEqual(['addOns.1.name']);
      await owner
        .post(`${menu}/add-on-groups`, {
          ...base,
          addOns: [{ name: 'Free', priceMinor: -1, isAvailable: true }],
        })
        .expect(400);
      await owner
        .post(`${menu}/add-on-groups`, {
          ...base,
          addOns: [
            {
              name: 'Gold leaf',
              priceMinor: MENU_LIMITS.addOnPriceMaxMinor + 1,
              isAvailable: true,
            },
          ],
          maxSelect: 1,
        })
        .expect(400);
      expect(
        fields(
          (
            await owner
              .post(`${menu}/add-on-groups`, {
                name: 'Required but empty',
                minSelect: 1,
                maxSelect: 1,
                addOns: [{ name: 'Sold out', priceMinor: 0, isAvailable: false }],
              })
              .expect(400)
          ).body,
        ),
      ).toEqual(['minSelect']);
    });

    it('creates a required group and rejects duplicate group names', async () => {
      const group = addOnGroupSchema.parse(
        (
          await owner
            .post(`${menu}/add-on-groups`, {
              name: 'Spice level',
              minSelect: 1,
              maxSelect: 1,
              addOns: ['Mild', 'Medium', 'Hot'].map((name) => ({
                name,
                priceMinor: 0,
                isAvailable: true,
              })),
            })
            .expect(201)
        ).body,
      );
      spiceGroup = group.id;
      expect(group.addOns.map((addOn) => addOn.name)).toEqual(['Mild', 'Medium', 'Hot']);
      const duplicate = await owner
        .post(`${menu}/add-on-groups`, {
          name: 'SPICE LEVEL',
          minSelect: 0,
          maxSelect: 1,
          addOns: [{ name: 'X', priceMinor: 0, isAvailable: true }],
        })
        .expect(409);
      expect(fields(duplicate.body)).toEqual(['name']);
    });

    it('replaces options, swapping names and archiving removed ones', async () => {
      const current = addOnGroupSchema.parse(
        (await owner.get(`${menu}/add-on-groups/${spiceGroup}`).expect(200)).body,
      );
      const [mild, medium, hot] = current.addOns;
      const replaced = addOnGroupSchema.parse(
        (
          await owner
            .put(`${menu}/add-on-groups/${spiceGroup}`, {
              name: 'Spice level',
              minSelect: 1,
              maxSelect: 1,
              addOns: [
                { id: mild?.id, name: 'Medium', priceMinor: 0, isAvailable: true },
                { id: medium?.id, name: 'Mild', priceMinor: 0, isAvailable: true },
              ],
            })
            .expect(200)
        ).body,
      );
      expect(replaced.addOns.map((addOn) => [addOn.id, addOn.name])).toEqual([
        [mild?.id, 'Medium'],
        [medium?.id, 'Mild'],
      ]);
      const archived = await harness.prisma.addOn.findUniqueOrThrow({
        where: { id: hot?.id ?? '' },
      });
      expect(archived.archivedAt).not.toBeNull();
    });
  });

  describe('products', () => {
    let productId: string;

    it('validates variants, prices and references', async () => {
      const cases: [Record<string, unknown>, string[]][] = [
        [{ variants: [] }, ['variants']],
        [
          {
            variants: [
              { name: 'Half', priceMinor: 100, isAvailable: true, isDefault: true },
              { name: 'Full', priceMinor: 200, isAvailable: true, isDefault: true },
            ],
          },
          ['variants'],
        ],
        [
          {
            variants: [
              { name: 'Half', priceMinor: 100, isAvailable: true, isDefault: true },
              { name: 'half', priceMinor: 200, isAvailable: true, isDefault: false },
            ],
          },
          ['variants.1.name'],
        ],
        [
          { variants: [{ name: 'Half', priceMinor: -1, isAvailable: true, isDefault: true }] },
          ['variants.0.priceMinor'],
        ],
        [
          {
            variants: [
              {
                name: 'Half',
                priceMinor: MENU_LIMITS.variantPriceMaxMinor + 1,
                isAvailable: true,
                isDefault: true,
              },
            ],
          },
          ['variants.0.priceMinor'],
        ],
        [
          {
            variants: Array.from({ length: MENU_LIMITS.variantsPerProduct + 1 }, (_, index) => ({
              name: `Size ${index}`,
              priceMinor: 100,
              isAvailable: true,
              isDefault: index === 0,
            })),
          },
          ['variants'],
        ],
        [
          {
            status: 'PUBLISHED',
            variants: [{ name: 'Half', priceMinor: 100, isAvailable: false, isDefault: true }],
          },
          ['variants'],
        ],
        [{ price: 1 }, ['price']],
      ];
      for (const [overrides, expected] of cases) {
        const response = await owner.post(`${menu}/products`, productBody(overrides)).expect(400);
        expect(fields(response.body)).toEqual(expect.arrayContaining(expected));
      }
    });

    it('creates a product with variants and customization groups', async () => {
      const product = productDetailSchema.parse(
        (await owner.post(`${menu}/products`, productBody()).expect(201)).body,
      );
      productId = product.id;
      expect(product).toMatchObject({
        slug: 'chicken-karahi',
        status: 'PUBLISHED',
        priceFromMinor: 145_000,
        variantCount: 2,
        addOnGroups: [{ id: spiceGroup, minSelect: 1, maxSelect: 1 }],
      });
      expect(product.variants.find((variant) => variant.isDefault)?.name).toBe('Half');
    });

    it('rejects SKUs already used by another product', async () => {
      const response = await owner
        .post(
          `${menu}/products`,
          productBody({
            name: 'Mutton Karahi',
            variants: [
              {
                name: 'Full',
                priceMinor: 400_000,
                isAvailable: true,
                isDefault: true,
                sku: 'KAR-FULL',
              },
            ],
          }),
        )
        .expect(409);
      expect(fields(response.body)).toEqual(['variants.0.sku']);
    });

    it('updates prices, switches the default and archives removed variants', async () => {
      const current = productDetailSchema.parse(
        (await owner.get(`${menu}/products/${productId}`).expect(200)).body,
      );
      const [half, full] = current.variants;
      const updated = productDetailSchema.parse(
        (
          await owner
            .put(
              `${menu}/products/${productId}`,
              productBody({
                variants: [
                  {
                    id: full?.id,
                    name: 'Full',
                    priceMinor: 285_000,
                    isAvailable: true,
                    isDefault: true,
                    sku: 'KAR-FULL',
                  },
                  { name: 'Family', priceMinor: 520_000, isAvailable: true, isDefault: false },
                ],
              }),
            )
            .expect(200)
        ).body,
      );
      expect(
        updated.variants.map((variant) => [variant.name, variant.priceMinor, variant.isDefault]),
      ).toEqual([
        ['Full', 285_000, true],
        ['Family', 520_000, false],
      ]);
      expect(updated.priceFromMinor).toBe(285_000);

      const archivedHalf = await harness.prisma.productVariant.findUniqueOrThrow({
        where: { id: half?.id ?? '' },
      });
      expect(archivedHalf.archivedAt).not.toBeNull();

      const audit = await harness.prisma.auditLog.findFirstOrThrow({
        where: { organizationId, action: 'menu.product_updated', entityId: productId },
        orderBy: { createdAt: 'desc' },
      });
      expect(JSON.stringify(audit.changes)).toContain('"from":270000');
      expect(JSON.stringify(audit.changes)).toContain('"to":285000');

      const listed = productPage.parse((await owner.get(`${menu}/products`).expect(200)).body);
      expect(listed.items.find((item) => item.id === productId)?.priceFromMinor).toBe(285_000);
    });

    it('rejects variant IDs that belong to another product', async () => {
      const other = productDetailSchema.parse(
        (
          await owner
            .post(
              `${menu}/products`,
              productBody({
                name: 'Seekh Kebab',
                variants: [
                  { name: 'Regular', priceMinor: 90_000, isAvailable: true, isDefault: true },
                ],
              }),
            )
            .expect(201)
        ).body,
      );
      const foreignVariant = other.variants[0]?.id;
      const response = await owner
        .put(
          `${menu}/products/${productId}`,
          productBody({
            variants: [
              {
                id: foreignVariant,
                name: 'Stolen',
                priceMinor: 1,
                isAvailable: true,
                isDefault: true,
              },
            ],
          }),
        )
        .expect(400);
      expect(fields(response.body)).toEqual(['variants.0.id']);
    });

    it('toggles draft/published and availability, refusing to publish without an available option', async () => {
      const draft = productDetailSchema.parse(
        (
          await owner
            .post(
              `${menu}/products`,
              productBody({
                name: 'Seasonal Special',
                status: 'DRAFT',
                variants: [
                  { name: 'Regular', priceMinor: 50_000, isAvailable: false, isDefault: true },
                ],
              }),
            )
            .expect(201)
        ).body,
      );
      const publish = await owner
        .patch(`${menu}/products/${draft.id}`, { status: 'PUBLISHED' })
        .expect(400);
      expect(fields(publish.body)).toEqual(['status']);

      const unavailable = productDetailSchema.parse(
        (await owner.patch(`${menu}/products/${productId}`, { isAvailable: false }).expect(200))
          .body,
      );
      expect(unavailable.isAvailable).toBe(false);
      const unpublished = productDetailSchema.parse(
        (
          await owner
            .patch(`${menu}/products/${productId}`, { status: 'DRAFT', isAvailable: true })
            .expect(200)
        ).body,
      );
      expect(unpublished.status).toBe('DRAFT');
    });

    it('searches, filters and paginates', async () => {
      const searched = productPage.parse(
        (await owner.get(`${menu}/products?search=KARAHI`).expect(200)).body,
      );
      expect(searched.items.map((item) => item.name)).toEqual(['Chicken Karahi']);
      const drafts = productPage.parse(
        (await owner.get(`${menu}/products?status=DRAFT`).expect(200)).body,
      );
      expect(drafts.items.every((item) => item.status === 'DRAFT')).toBe(true);
      const firstPage = productPage.parse(
        (await owner.get(`${menu}/products?page=1&pageSize=2`).expect(200)).body,
      );
      expect(firstPage).toMatchObject({ page: 1, pageSize: 2, total: 3 });
      expect(firstPage.items).toHaveLength(2);
      await owner.get(`${menu}/products?pageSize=500`).expect(400);
    });

    it('refuses to archive a category that still has products, and archives products', async () => {
      const blocked = await owner.delete(`${menu}/categories/${karahiCategory}`).expect(409);
      expect(code(blocked.body)).toBe('CONFLICT');
      const extra = productDetailSchema.parse(
        (
          await owner
            .post(
              `${menu}/products`,
              productBody({
                name: 'To Remove',
                variants: [{ name: 'Regular', priceMinor: 1, isAvailable: true, isDefault: true }],
              }),
            )
            .expect(201)
        ).body,
      );
      await owner.delete(`${menu}/products/${extra.id}`).expect(204);
      await owner.get(`${menu}/products/${extra.id}`).expect(404);
    });
  });

  describe('images', () => {
    let productId: string;

    beforeAll(async () => {
      const list = productPage.parse(
        (await owner.get(`${menu}/products?search=Chicken`).expect(200)).body,
      );
      productId = list.items[0]?.id ?? '';
    });

    it('stores a validated image and serves it back', async () => {
      const uploaded = productDetailSchema.parse(
        (
          await owner
            .upload(`${menu}/products/${productId}/image`, PNG, 'photo.png', 'image/png')
            .expect(201)
        ).body,
      );
      expect(uploaded.imageUrl).toMatch(
        new RegExp(`^/api/v1/media/${organizationId}/products/[0-9a-f-]{36}\\.png$`),
      );

      const served = await request(harness.app.getHttpServer())
        .get(uploaded.imageUrl ?? '')
        .expect(200);
      expect(served.headers['content-type']).toBe('image/png');
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.from(served.body as Buffer)).toEqual(PNG);

      const replaced = productDetailSchema.parse(
        (
          await owner
            .upload(`${menu}/products/${productId}/image`, JPEG, 'photo.jpg', 'image/jpeg')
            .expect(201)
        ).body,
      );
      expect(replaced.imageUrl).toMatch(/\.jpg$/);
      await request(harness.app.getHttpServer())
        .get(uploaded.imageUrl ?? '')
        .expect(404);

      const removed = productDetailSchema.parse(
        (await owner.delete(`${menu}/products/${productId}/image`).expect(200)).body,
      );
      expect(removed.imageUrl).toBeNull();
      await request(harness.app.getHttpServer())
        .get(replaced.imageUrl ?? '')
        .expect(404);
    });

    it('rejects disguised, unsupported, empty, missing and oversized files', async () => {
      const path = `${menu}/products/${productId}/image`;
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
      expect(
        code((await owner.upload(path, svg, 'logo.svg', 'image/svg+xml').expect(415)).body),
      ).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(
        code(
          (
            await owner
              .upload(path, Buffer.from('not an image'), 'fake.png', 'image/png')
              .expect(415)
          ).body,
        ),
      ).toBe('UNSUPPORTED_MEDIA_TYPE');
      await owner.upload(path, Buffer.alloc(0), 'empty.png', 'image/png').expect(400);
      await owner.post(path, {}).expect(400);
      const oversized = Buffer.concat([PNG, Buffer.alloc(MENU_LIMITS.imageMaxBytes)]);
      expect(
        code((await owner.upload(path, oversized, 'huge.png', 'image/png').expect(413)).body),
      ).toBe('PAYLOAD_TOO_LARGE');
      const product = productDetailSchema.parse(
        (await owner.get(`${menu}/products/${productId}`).expect(200)).body,
      );
      expect(product.imageUrl).toBeNull();
    });
  });

  describe('authorization and tenant isolation', () => {
    let kitchen: Client;
    let rider: Client;
    let outsider: Client;
    let outsiderMenu: string;
    let productId: string;
    let outsiderCategory: string;
    let outsiderGroup: string;

    beforeAll(async () => {
      ({ client: kitchen } = await addMember(
        harness,
        owner,
        organizationId,
        'KITCHEN_STAFF',
        'menu-kitchen',
      ));
      ({ client: rider } = await addMember(harness, owner, organizationId, 'RIDER', 'menu-rider'));
      ({ client: outsider } = await registerUser(harness, 'menu-outsider'));
      const outsiderOrg = await createOrganization(outsider, 'rival');
      outsiderMenu = `/organizations/${outsiderOrg}/menu`;
      outsiderCategory = categorySchema.parse(
        (await outsider.post(`${outsiderMenu}/categories`, { name: 'Rival Category' }).expect(201))
          .body,
      ).id;
      outsiderGroup = addOnGroupSchema.parse(
        (
          await outsider
            .post(`${outsiderMenu}/add-on-groups`, {
              name: 'Rival Extras',
              minSelect: 0,
              maxSelect: 1,
              addOns: [{ name: 'Rival', priceMinor: 0, isAvailable: true }],
            })
            .expect(201)
        ).body,
      ).id;
      const list = productPage.parse(
        (await owner.get(`${menu}/products?search=Chicken`).expect(200)).body,
      );
      productId = list.items[0]?.id ?? '';
    });

    it('lets kitchen staff read the menu but not change it, and hides it from riders', async () => {
      await kitchen.get(`${menu}/categories`).expect(200);
      await kitchen.get(`${menu}/products/${productId}`).expect(200);
      await kitchen.post(`${menu}/categories`, { name: 'Kitchen Category' }).expect(403);
      await kitchen.patch(`${menu}/products/${productId}`, { isAvailable: false }).expect(403);
      await kitchen
        .upload(`${menu}/products/${productId}/image`, PNG, 'x.png', 'image/png')
        .expect(403);
      await rider.get(`${menu}/products`).expect(403);
    });

    it('hides another restaurant’s menu behind 404', async () => {
      await outsider.get(`${menu}/categories`).expect(404);
      await outsider.get(`${menu}/products/${productId}`).expect(404);
      await outsider.put(`${menu}/products/${productId}`, productBody()).expect(404);
      await outsider
        .upload(`${menu}/products/${productId}/image`, PNG, 'x.png', 'image/png')
        .expect(404);
      await outsider.get(`${outsiderMenu}/products/${productId}`).expect(404);
      await outsider
        .patch(`${outsiderMenu}/products/${productId}`, { isAvailable: false })
        .expect(404);
      await outsider
        .patch(`${outsiderMenu}/categories/${karahiCategory}`, { name: 'Taken' })
        .expect(404);
      await outsider
        .put(`${outsiderMenu}/add-on-groups/${spiceGroup}`, {
          name: 'Taken',
          minSelect: 0,
          maxSelect: 1,
          addOns: [{ name: 'X', priceMinor: 0, isAvailable: true }],
        })
        .expect(404);
      const product = productDetailSchema.parse(
        (await owner.get(`${menu}/products/${productId}`).expect(200)).body,
      );
      expect(product.name).toBe('Chicken Karahi');
    });

    it('rejects categories and customization groups from another restaurant', async () => {
      const response = await owner
        .post(
          `${menu}/products`,
          productBody({
            name: 'Cross Tenant',
            categoryId: outsiderCategory,
            addOnGroupIds: [outsiderGroup],
          }),
        )
        .expect(400);
      expect(fields(response.body)).toEqual(
        expect.arrayContaining(['categoryId', 'addOnGroupIds']),
      );
    });
  });
});
