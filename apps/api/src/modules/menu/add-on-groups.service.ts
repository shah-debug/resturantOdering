import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AddOnGroup,
  addOnGroupUpsertRequestSchema,
  type AddOnGroupUpsertRequest,
} from '@app/contracts';
import { AppException, ValidationFailedException } from '../../common/errors/app.exception.js';
import { assertValid } from '../../common/validation/schema.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditAction } from '../audit/audit.service.js';
import { type MenuActor, MenuAudit } from './menu-audit.js';

export function addOnGroupNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Customization group not found');
}

export function archivedName(name: string, id: string): string {
  return `${name.slice(0, 100)} [archived ${id.slice(-8)}]`;
}

const groupSelect = {
  id: true,
  name: true,
  minSelect: true,
  maxSelect: true,
  addOns: {
    where: { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, priceMinor: true, isAvailable: true, sortOrder: true },
  },
  _count: { select: { products: { where: { product: { archivedAt: null } } } } },
} satisfies Prisma.AddOnGroupSelect;

interface GroupRow {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  addOns: {
    id: string;
    name: string;
    priceMinor: number;
    isAvailable: boolean;
    sortOrder: number;
  }[];
  _count: { products: number };
}

function toGroup({ _count, ...row }: GroupRow): AddOnGroup {
  return { ...row, productCount: _count.products };
}

@Injectable()
export class AddOnGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: MenuAudit,
  ) {}

  async list(organizationId: string): Promise<AddOnGroup[]> {
    const rows = await this.prisma.addOnGroup.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: groupSelect,
    });
    return rows.map(toGroup);
  }

  async get(organizationId: string, groupId: string): Promise<AddOnGroup> {
    const row = await this.prisma.addOnGroup.findFirst({
      where: { id: groupId, organizationId, archivedAt: null },
      select: groupSelect,
    });
    if (!row) {
      throw addOnGroupNotFound();
    }
    return toGroup(row);
  }

  async create(actor: MenuActor, input: AddOnGroupUpsertRequest): Promise<AddOnGroup> {
    const dto = assertValid(addOnGroupUpsertRequestSchema, input);
    if (dto.addOns.some((addOn) => addOn.id)) {
      throw new ValidationFailedException([
        { field: 'addOns', message: 'New groups cannot reference existing options' },
      ]);
    }
    await this.assertNameFree(actor.organizationId, dto.name, null);
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.addOnGroup.create({
        data: {
          organizationId: actor.organizationId,
          name: dto.name,
          minSelect: dto.minSelect,
          maxSelect: dto.maxSelect,
        },
        select: { id: true },
      });
      await tx.addOn.createMany({
        data: dto.addOns.map((addOn, index) => ({
          organizationId: actor.organizationId,
          addOnGroupId: group.id,
          name: addOn.name,
          priceMinor: addOn.priceMinor,
          isAvailable: addOn.isAvailable,
          sortOrder: index,
        })),
      });
      await this.audit.record(tx, actor, AuditAction.AddOnGroupCreated, 'add_on_group', group.id, {
        name: dto.name,
        options: dto.addOns.length,
      });
      return toGroup(
        await tx.addOnGroup.findUniqueOrThrow({ where: { id: group.id }, select: groupSelect }),
      );
    });
  }

  async replace(
    actor: MenuActor,
    groupId: string,
    input: AddOnGroupUpsertRequest,
  ): Promise<AddOnGroup> {
    const dto = assertValid(addOnGroupUpsertRequestSchema, input);
    const current = await this.prisma.addOnGroup.findFirst({
      where: { id: groupId, organizationId: actor.organizationId, archivedAt: null },
      select: {
        id: true,
        addOns: { where: { archivedAt: null }, select: { id: true, name: true } },
      },
    });
    if (!current) {
      throw addOnGroupNotFound();
    }
    const existingIds = new Set(current.addOns.map((addOn) => addOn.id));
    const foreign = dto.addOns.findIndex((addOn) => addOn.id && !existingIds.has(addOn.id));
    if (foreign >= 0) {
      throw new ValidationFailedException([
        { field: `addOns.${foreign}.id`, message: 'This option does not belong to the group' },
      ]);
    }
    await this.assertNameFree(actor.organizationId, dto.name, groupId);

    const keptIds = new Set(dto.addOns.flatMap((addOn) => (addOn.id ? [addOn.id] : [])));
    const removed = current.addOns.filter((addOn) => !keptIds.has(addOn.id));

    return this.prisma.$transaction(async (tx) => {
      for (const addOn of removed) {
        await tx.addOn.update({
          where: { id: addOn.id },
          data: {
            archivedAt: new Date(),
            isAvailable: false,
            name: archivedName(addOn.name, addOn.id),
          },
        });
      }
      for (const id of keptIds) {
        await tx.addOn.update({ where: { id }, data: { name: `__renaming__${id}` } });
      }
      for (const [index, addOn] of dto.addOns.entries()) {
        const data = {
          name: addOn.name,
          priceMinor: addOn.priceMinor,
          isAvailable: addOn.isAvailable,
          sortOrder: index,
        };
        if (addOn.id) {
          await tx.addOn.update({ where: { id: addOn.id }, data });
        } else {
          await tx.addOn.create({
            data: { ...data, organizationId: actor.organizationId, addOnGroupId: groupId },
          });
        }
      }
      await tx.addOnGroup.update({
        where: { id: groupId },
        data: { name: dto.name, minSelect: dto.minSelect, maxSelect: dto.maxSelect },
      });
      await this.audit.record(tx, actor, AuditAction.AddOnGroupUpdated, 'add_on_group', groupId, {
        options: dto.addOns.length,
        archivedOptions: removed.length,
        minSelect: dto.minSelect,
        maxSelect: dto.maxSelect,
      });
      return toGroup(
        await tx.addOnGroup.findUniqueOrThrow({ where: { id: groupId }, select: groupSelect }),
      );
    });
  }

  async archive(actor: MenuActor, groupId: string): Promise<void> {
    const group = await this.prisma.addOnGroup.findFirst({
      where: { id: groupId, organizationId: actor.organizationId, archivedAt: null },
      select: { id: true, name: true },
    });
    if (!group) {
      throw addOnGroupNotFound();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.productAddOnGroup.deleteMany({
        where: { organizationId: actor.organizationId, addOnGroupId: groupId },
      });
      await tx.addOnGroup.update({
        where: { id: groupId },
        data: { archivedAt: new Date(), name: archivedName(group.name, group.id) },
      });
      await this.audit.record(
        tx,
        actor,
        AuditAction.AddOnGroupArchived,
        'add_on_group',
        groupId,
        {},
      );
    });
  }

  private async assertNameFree(
    organizationId: string,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    const clash = await this.prisma.addOnGroup.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'A customization group with this name already exists',
        [{ field: 'name', message: 'A customization group with this name already exists' }],
      );
    }
  }
}
