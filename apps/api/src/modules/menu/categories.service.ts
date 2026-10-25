import { HttpStatus, Injectable } from '@nestjs/common';
import type { Category } from '@app/contracts';
import { AppException, ValidationFailedException } from '../../common/errors/app.exception.js';
import { nextAvailableSlug, slugify } from '../../common/text/slug.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditAction } from '../audit/audit.service.js';
import { type MenuActor, MenuAudit } from './menu-audit.js';

export function categoryNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Category not found');
}

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  _count: { select: { products: { where: { archivedAt: null } } } },
} satisfies Prisma.CategorySelect;

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  _count: { products: number };
}

function toCategory({ _count, createdAt, ...row }: CategoryRow): Category {
  return { ...row, productCount: _count.products, createdAt: createdAt.toISOString() };
}

export function assertSameIds(
  requested: readonly string[],
  existing: readonly string[],
  label: string,
): void {
  const expected = new Set(existing);
  if (requested.length !== expected.size || requested.some((id) => !expected.has(id))) {
    throw new ValidationFailedException([
      { field: 'ids', message: `List every current ${label} exactly once` },
    ]);
  }
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: MenuAudit,
  ) {}

  async list(organizationId: string): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: categorySelect,
    });
    return rows.map(toCategory);
  }

  async create(
    actor: MenuActor,
    dto: { name: string; description?: string | null; isActive?: boolean },
  ): Promise<Category> {
    const base = slugify(dto.name, 'category');
    const [taken, last] = await Promise.all([
      this.prisma.category.findMany({
        where: { organizationId: actor.organizationId, slug: { startsWith: base } },
        select: { slug: true },
      }),
      this.prisma.category.findFirst({
        where: { organizationId: actor.organizationId, archivedAt: null },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      }),
    ]);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.category.create({
        data: {
          organizationId: actor.organizationId,
          name: dto.name,
          slug: nextAvailableSlug(base, new Set(taken.map((category) => category.slug))),
          description: dto.description || null,
          isActive: dto.isActive ?? true,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
        select: categorySelect,
      });
      await this.audit.record(tx, actor, AuditAction.CategoryCreated, 'category', row.id, {
        name: dto.name,
      });
      return toCategory(row);
    });
  }

  async update(
    actor: MenuActor,
    categoryId: string,
    dto: { name?: string; description?: string | null; isActive?: boolean },
  ): Promise<Category> {
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changes).length === 0) {
      throw new ValidationFailedException([
        { field: 'body', message: 'Provide at least one field to update' },
      ]);
    }
    await this.assertCategory(actor.organizationId, categoryId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.category.update({
        where: { id: categoryId },
        data: { ...changes, ...(dto.description === '' ? { description: null } : {}) },
        select: categorySelect,
      });
      await this.audit.record(tx, actor, AuditAction.CategoryUpdated, 'category', categoryId, {
        fields: Object.keys(changes),
      });
      return toCategory(row);
    });
  }

  async archive(actor: MenuActor, categoryId: string): Promise<void> {
    await this.assertCategory(actor.organizationId, categoryId);
    const products = await this.prisma.product.count({
      where: { organizationId: actor.organizationId, categoryId, archivedAt: null },
    });
    if (products > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'Move or delete the products in this category first',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.category.update({
        where: { id: categoryId },
        data: { archivedAt: new Date(), isActive: false },
      });
      await this.audit.record(tx, actor, AuditAction.CategoryArchived, 'category', categoryId, {});
    });
  }

  async reorder(actor: MenuActor, ids: readonly string[]): Promise<Category[]> {
    const existing = await this.prisma.category.findMany({
      where: { organizationId: actor.organizationId, archivedAt: null },
      select: { id: true },
    });
    assertSameIds(
      ids,
      existing.map((category) => category.id),
      'category',
    );
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.category.update({ where: { id }, data: { sortOrder: index } });
      }
      await this.audit.record(tx, actor, AuditAction.CategoriesReordered, 'category', null, {
        count: ids.length,
      });
    });
    return this.list(actor.organizationId);
  }

  async assertCategory(organizationId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, organizationId, archivedAt: null },
      select: { id: true },
    });
    if (!category) {
      throw categoryNotFound();
    }
  }
}
