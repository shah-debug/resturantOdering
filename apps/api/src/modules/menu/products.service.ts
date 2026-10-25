import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  MENU_LIMITS,
  type Paginated,
  type ProductDetail,
  type ProductSummary,
  productUpsertRequestSchema,
  type ProductUpsertRequest,
} from '@app/contracts';
import { AppException, ValidationFailedException } from '../../common/errors/app.exception.js';
import { nextAvailableSlug, slugify } from '../../common/text/slug.js';
import { assertValid } from '../../common/validation/schema.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ProductStatus } from '../../generated/prisma/enums.js';
import { AuditAction } from '../audit/audit.service.js';
import { detectImageType } from '../storage/image-type.js';
import { ObjectStorage } from '../storage/object-storage.js';
import { assertSameIds } from './categories.service.js';
import { type MenuActor, MenuAudit } from './menu-audit.js';

export interface UploadedImage {
  buffer: Buffer;
  size: number;
}

export function productNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Product not found');
}

const summarySelect = {
  id: true,
  categoryId: true,
  name: true,
  slug: true,
  description: true,
  imageUrl: true,
  status: true,
  isAvailable: true,
  sortOrder: true,
  updatedAt: true,
  category: { select: { name: true } },
  variants: {
    where: { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      sku: true,
      priceMinor: true,
      isAvailable: true,
      isDefault: true,
      sortOrder: true,
    },
  },
} satisfies Prisma.ProductSelect;

const detailSelect = {
  ...summarySelect,
  addOnGroups: {
    where: { addOnGroup: { archivedAt: null } },
    orderBy: { sortOrder: 'asc' },
    select: { addOnGroup: { select: { id: true, name: true, minSelect: true, maxSelect: true } } },
  },
} satisfies Prisma.ProductSelect;

type SummaryRow = Prisma.ProductGetPayload<{ select: typeof summarySelect }>;
type DetailRow = Prisma.ProductGetPayload<{ select: typeof detailSelect }>;

function toSummary(row: SummaryRow): ProductSummary {
  const available = row.variants.filter((variant) => variant.isAvailable);
  const prices = (available.length > 0 ? available : row.variants).map(
    (variant) => variant.priceMinor,
  );
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.imageUrl,
    status: row.status,
    isAvailable: row.isAvailable,
    sortOrder: row.sortOrder,
    priceFromMinor: prices.length > 0 ? Math.min(...prices) : null,
    variantCount: row.variants.length,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: DetailRow): ProductDetail {
  return {
    ...toSummary(row),
    variants: row.variants,
    addOnGroups: row.addOnGroups.map((link) => link.addOnGroup),
  };
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: MenuAudit,
    private readonly storage: ObjectStorage,
  ) {}

  async list(
    organizationId: string,
    query: {
      search?: string;
      categoryId?: string;
      status?: ProductStatus;
      page: number;
      pageSize: number;
    },
  ): Promise<Paginated<ProductSummary>> {
    const where: Prisma.ProductWhereInput = {
      organizationId,
      archivedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: summarySelect,
      }),
    ]);
    return { items: rows.map(toSummary), page: query.page, pageSize: query.pageSize, total };
  }

  async get(organizationId: string, productId: string): Promise<ProductDetail> {
    const row = await this.prisma.product.findFirst({
      where: { id: productId, organizationId, archivedAt: null },
      select: detailSelect,
    });
    if (!row) {
      throw productNotFound();
    }
    return toDetail(row);
  }

  async create(actor: MenuActor, input: ProductUpsertRequest): Promise<ProductDetail> {
    const dto = assertValid(productUpsertRequestSchema, input);
    if (dto.variants.some((variant) => variant.id)) {
      throw new ValidationFailedException([
        { field: 'variants', message: 'New products cannot reference existing options' },
      ]);
    }
    await this.assertReferences(actor.organizationId, dto);
    await this.assertSkusFree(actor.organizationId, dto, []);

    const base = slugify(dto.name, 'item');
    const [taken, last] = await Promise.all([
      this.prisma.product.findMany({
        where: { organizationId: actor.organizationId, slug: { startsWith: base } },
        select: { slug: true },
      }),
      this.prisma.product.findFirst({
        where: {
          organizationId: actor.organizationId,
          categoryId: dto.categoryId,
          archivedAt: null,
        },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      }),
    ]);

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          organizationId: actor.organizationId,
          categoryId: dto.categoryId,
          name: dto.name,
          slug: nextAvailableSlug(base, new Set(taken.map((item) => item.slug))),
          description: dto.description || null,
          status: dto.status,
          isAvailable: dto.isAvailable,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
        select: { id: true },
      });
      await this.writeVariantsAndGroups(tx, actor.organizationId, product.id, dto, []);
      await this.audit.record(tx, actor, AuditAction.ProductCreated, 'product', product.id, {
        name: dto.name,
        status: dto.status,
        prices: dto.variants.map((variant) => variant.priceMinor),
      });
      return toDetail(
        await tx.product.findUniqueOrThrow({ where: { id: product.id }, select: detailSelect }),
      );
    });
  }

  async replace(
    actor: MenuActor,
    productId: string,
    input: ProductUpsertRequest,
  ): Promise<ProductDetail> {
    const dto = assertValid(productUpsertRequestSchema, input);
    const current = await this.prisma.product.findFirst({
      where: { id: productId, organizationId: actor.organizationId, archivedAt: null },
      select: {
        id: true,
        categoryId: true,
        variants: { where: { archivedAt: null }, select: { id: true, priceMinor: true } },
      },
    });
    if (!current) {
      throw productNotFound();
    }
    const existingIds = new Set(current.variants.map((variant) => variant.id));
    const foreign = dto.variants.findIndex((variant) => variant.id && !existingIds.has(variant.id));
    if (foreign >= 0) {
      throw new ValidationFailedException([
        { field: `variants.${foreign}.id`, message: 'This option does not belong to the product' },
      ]);
    }
    await this.assertReferences(actor.organizationId, dto);
    const keptIds = dto.variants.flatMap((variant) => (variant.id ? [variant.id] : []));
    await this.assertSkusFree(actor.organizationId, dto, keptIds);

    const movedCategory = dto.categoryId !== current.categoryId;
    const last = movedCategory
      ? await this.prisma.product.findFirst({
          where: {
            organizationId: actor.organizationId,
            categoryId: dto.categoryId,
            archivedAt: null,
          },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        })
      : null;

    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          categoryId: dto.categoryId,
          name: dto.name,
          description: dto.description || null,
          status: dto.status,
          isAvailable: dto.isAvailable,
          ...(movedCategory ? { sortOrder: (last?.sortOrder ?? -1) + 1 } : {}),
        },
      });
      await this.writeVariantsAndGroups(
        tx,
        actor.organizationId,
        productId,
        dto,
        current.variants.map((variant) => variant.id),
      );
      const previousPrices = Object.fromEntries(
        current.variants.map((variant) => [variant.id, variant.priceMinor]),
      );
      await this.audit.record(tx, actor, AuditAction.ProductUpdated, 'product', productId, {
        status: dto.status,
        isAvailable: dto.isAvailable,
        priceChanges: dto.variants
          .filter((variant) => variant.id && previousPrices[variant.id] !== variant.priceMinor)
          .map((variant) => ({
            variantId: variant.id ?? null,
            from: previousPrices[variant.id ?? ''] ?? null,
            to: variant.priceMinor,
          })),
      });
      return toDetail(
        await tx.product.findUniqueOrThrow({ where: { id: productId }, select: detailSelect }),
      );
    });
  }

  async patch(
    actor: MenuActor,
    productId: string,
    dto: { status?: ProductStatus; isAvailable?: boolean },
  ): Promise<ProductDetail> {
    if (dto.status === undefined && dto.isAvailable === undefined) {
      throw new ValidationFailedException([
        { field: 'body', message: 'Provide at least one field to update' },
      ]);
    }
    const current = await this.prisma.product.findFirst({
      where: { id: productId, organizationId: actor.organizationId, archivedAt: null },
      select: {
        id: true,
        variants: { where: { archivedAt: null, isAvailable: true }, select: { id: true } },
      },
    });
    if (!current) {
      throw productNotFound();
    }
    if (dto.status === ProductStatus.PUBLISHED && current.variants.length === 0) {
      throw new ValidationFailedException([
        { field: 'status', message: 'A published product needs at least one available option' },
      ]);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: productId }, data: dto });
      await this.audit.record(tx, actor, AuditAction.ProductUpdated, 'product', productId, {
        ...dto,
      });
      return toDetail(
        await tx.product.findUniqueOrThrow({ where: { id: productId }, select: detailSelect }),
      );
    });
  }

  async archive(actor: MenuActor, productId: string): Promise<void> {
    const current = await this.prisma.product.findFirst({
      where: { id: productId, organizationId: actor.organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!current) {
      throw productNotFound();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: { archivedAt: new Date(), status: ProductStatus.DRAFT, isAvailable: false },
      });
      await this.audit.record(tx, actor, AuditAction.ProductArchived, 'product', productId, {});
    });
  }

  async reorder(
    actor: MenuActor,
    categoryId: string,
    ids: readonly string[],
  ): Promise<ProductSummary[]> {
    const existing = await this.prisma.product.findMany({
      where: { organizationId: actor.organizationId, categoryId, archivedAt: null },
      select: { id: true },
    });
    assertSameIds(
      ids,
      existing.map((product) => product.id),
      'product in this category',
    );
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.product.update({ where: { id }, data: { sortOrder: index } });
      }
      await this.audit.record(tx, actor, AuditAction.ProductsReordered, 'category', categoryId, {
        count: ids.length,
      });
    });
    const rows = await this.prisma.product.findMany({
      where: { organizationId: actor.organizationId, categoryId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: summarySelect,
    });
    return rows.map(toSummary);
  }

  async setImage(
    actor: MenuActor,
    productId: string,
    file: UploadedImage | undefined,
  ): Promise<ProductDetail> {
    if (!file || file.size === 0) {
      throw new ValidationFailedException([
        { field: 'file', message: 'Choose an image to upload' },
      ]);
    }
    if (file.size > MENU_LIMITS.imageMaxBytes) {
      throw new AppException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'PAYLOAD_TOO_LARGE',
        'Images must be 5 MB or smaller',
      );
    }
    const detected = detectImageType(file.buffer);
    if (!detected) {
      throw new AppException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'UNSUPPORTED_MEDIA_TYPE',
        'Upload a JPEG, PNG or WebP image',
      );
    }
    const current = await this.prisma.product.findFirst({
      where: { id: productId, organizationId: actor.organizationId, archivedAt: null },
      select: { id: true, imageKey: true },
    });
    if (!current) {
      throw productNotFound();
    }

    const key = `${actor.organizationId}/products/${randomUUID()}.${detected.extension}`;
    const stored = await this.storage.put(key, file.buffer, detected.contentType);
    let detail: ProductDetail;
    try {
      detail = await this.prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: productId },
          data: { imageUrl: stored.url, imageKey: stored.key },
        });
        await this.audit.record(tx, actor, AuditAction.ProductImageUpdated, 'product', productId, {
          contentType: detected.contentType,
          bytes: file.size,
        });
        return toDetail(
          await tx.product.findUniqueOrThrow({ where: { id: productId }, select: detailSelect }),
        );
      });
    } catch (error) {
      await this.deleteObject(stored.key);
      throw error;
    }
    if (current.imageKey) {
      await this.deleteObject(current.imageKey);
    }
    return detail;
  }

  async removeImage(actor: MenuActor, productId: string): Promise<ProductDetail> {
    const current = await this.prisma.product.findFirst({
      where: { id: productId, organizationId: actor.organizationId, archivedAt: null },
      select: { id: true, imageKey: true },
    });
    if (!current) {
      throw productNotFound();
    }
    const detail = await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: { imageUrl: null, imageKey: null },
      });
      await this.audit.record(tx, actor, AuditAction.ProductImageUpdated, 'product', productId, {
        removed: true,
      });
      return toDetail(
        await tx.product.findUniqueOrThrow({ where: { id: productId }, select: detailSelect }),
      );
    });
    if (current.imageKey) {
      await this.deleteObject(current.imageKey);
    }
    return detail;
  }

  private async writeVariantsAndGroups(
    tx: Prisma.TransactionClient,
    organizationId: string,
    productId: string,
    dto: ProductUpsertRequest,
    currentVariantIds: readonly string[],
  ): Promise<void> {
    const keptIds = new Set(dto.variants.flatMap((variant) => (variant.id ? [variant.id] : [])));
    await tx.productVariant.updateMany({
      where: { productId, archivedAt: null },
      data: { isDefault: false },
    });
    const removed = currentVariantIds.filter((id) => !keptIds.has(id));
    if (removed.length > 0) {
      await tx.productVariant.updateMany({
        where: { id: { in: removed } },
        data: { archivedAt: new Date(), isAvailable: false, sku: null },
      });
    }
    for (const [index, variant] of dto.variants.entries()) {
      const data = {
        name: variant.name,
        priceMinor: variant.priceMinor,
        sku: variant.sku || null,
        isAvailable: variant.isAvailable,
        isDefault: variant.isDefault,
        sortOrder: index,
      };
      if (variant.id) {
        await tx.productVariant.update({ where: { id: variant.id }, data });
      } else {
        await tx.productVariant.create({ data: { ...data, organizationId, productId } });
      }
    }
    await tx.productAddOnGroup.deleteMany({ where: { organizationId, productId } });
    if (dto.addOnGroupIds.length > 0) {
      await tx.productAddOnGroup.createMany({
        data: dto.addOnGroupIds.map((addOnGroupId, index) => ({
          organizationId,
          productId,
          addOnGroupId,
          sortOrder: index,
        })),
      });
    }
  }

  private async assertReferences(organizationId: string, dto: ProductUpsertRequest): Promise<void> {
    const errors = [];
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!category) {
      errors.push({ field: 'categoryId', message: 'Choose a category from this restaurant' });
    }
    if (dto.addOnGroupIds.length > 0) {
      const groups = await this.prisma.addOnGroup.count({
        where: { id: { in: dto.addOnGroupIds }, organizationId, archivedAt: null },
      });
      if (groups !== dto.addOnGroupIds.length) {
        errors.push({
          field: 'addOnGroupIds',
          message: 'Choose customization groups from this restaurant',
        });
      }
    }
    if (errors.length > 0) {
      throw new ValidationFailedException(errors);
    }
  }

  private async assertSkusFree(
    organizationId: string,
    dto: ProductUpsertRequest,
    ownVariantIds: readonly string[],
  ): Promise<void> {
    const skus = dto.variants.flatMap((variant) => (variant.sku ? [variant.sku] : []));
    if (new Set(skus).size !== skus.length) {
      throw new ValidationFailedException([
        { field: 'variants', message: 'Each SKU must be unique' },
      ]);
    }
    if (skus.length === 0) {
      return;
    }
    const clashes = await this.prisma.productVariant.findMany({
      where: { organizationId, sku: { in: skus }, id: { notIn: [...ownVariantIds] } },
      select: { sku: true },
    });
    if (clashes.length > 0) {
      const taken = new Set(clashes.map((variant) => variant.sku));
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'Another product already uses this SKU',
        dto.variants.flatMap((variant, index) =>
          variant.sku && taken.has(variant.sku)
            ? [{ field: `variants.${index}.sku`, message: 'This SKU is already in use' }]
            : [],
        ),
      );
    }
  }

  private async deleteObject(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn(
        `Could not delete stored image ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
