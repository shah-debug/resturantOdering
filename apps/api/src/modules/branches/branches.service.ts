import { HttpStatus, Injectable } from '@nestjs/common';
import { type Branch, findOpeningHoursOverlap, timeToMinutes } from '@app/contracts';
import { AppException, ValidationFailedException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { AuthContext, RequestMeta } from '../auth/http/request-context.js';
import {
  branchSelect,
  DEFAULT_DELIVERY_ZONE_NAME,
  slugifyBranchName,
  toBranch,
} from './branch.mapper.js';
import type {
  CreateBranchDto,
  FulfillmentDto,
  OpeningHoursDto,
  UpdateBranchDto,
} from './dto/branch.dto.js';

export function branchNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Branch not found');
}

export interface BranchActor {
  auth: AuthContext;
  organizationId: string;
  meta: RequestMeta;
}

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string): Promise<Branch[]> {
    const rows = await this.prisma.branch.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: branchSelect,
    });
    return rows.map(toBranch);
  }

  async get(organizationId: string, branchId: string): Promise<Branch> {
    const row = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId },
      select: branchSelect,
    });
    if (!row) {
      throw branchNotFound();
    }
    return toBranch(row);
  }

  async create(actor: BranchActor, dto: CreateBranchDto): Promise<Branch> {
    const base = slugifyBranchName(dto.name);
    const taken = new Set(
      (
        await this.prisma.branch.findMany({
          where: { organizationId: actor.organizationId, slug: { startsWith: base } },
          select: { slug: true },
        })
      ).map((branch) => branch.slug),
    );
    let slug = base;
    for (let suffix = 2; taken.has(slug); suffix += 1) {
      slug = `${base}-${suffix}`;
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.branch.create({
        data: {
          organizationId: actor.organizationId,
          name: dto.name,
          slug,
          phone: dto.phone,
          addressLine: dto.addressLine,
          area: dto.area ?? null,
          city: dto.city,
        },
        select: branchSelect,
      });
      await this.record(tx, actor, AuditAction.BranchCreated, row.id, {
        name: dto.name,
        city: dto.city,
      });
      return toBranch(row);
    });
  }

  async update(actor: BranchActor, branchId: string, dto: UpdateBranchDto): Promise<Branch> {
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    ) as UpdateBranchDto;
    if (Object.keys(changes).length === 0) {
      throw new ValidationFailedException([
        { field: 'body', message: 'Provide at least one field to update' },
      ]);
    }
    await this.assertBranch(actor.organizationId, branchId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.branch.update({
        where: { id: branchId },
        data: changes,
        select: branchSelect,
      });
      await this.record(tx, actor, AuditAction.BranchUpdated, branchId, {
        fields: Object.keys(changes),
      });
      return toBranch(row);
    });
  }

  async replaceOpeningHours(
    actor: BranchActor,
    branchId: string,
    dto: OpeningHoursDto,
  ): Promise<Branch> {
    const invalid = dto.intervals.findIndex((interval) => interval.opensAt === interval.closesAt);
    if (invalid >= 0) {
      throw new ValidationFailedException([
        {
          field: `intervals.${invalid}.closesAt`,
          message: 'Opening and closing times must differ',
        },
      ]);
    }
    const overlap = findOpeningHoursOverlap(dto.intervals);
    if (overlap) {
      throw new ValidationFailedException([
        { field: `intervals.${overlap[1]}`, message: 'This time overlaps another opening period' },
      ]);
    }
    await this.assertBranch(actor.organizationId, branchId);

    return this.prisma.$transaction(async (tx) => {
      await tx.branchOpeningHours.deleteMany({
        where: { organizationId: actor.organizationId, branchId },
      });
      if (dto.intervals.length > 0) {
        await tx.branchOpeningHours.createMany({
          data: dto.intervals.map((interval) => ({
            organizationId: actor.organizationId,
            branchId,
            dayOfWeek: interval.dayOfWeek,
            opensAtMinutes: timeToMinutes(interval.opensAt),
            closesAtMinutes: timeToMinutes(interval.closesAt),
          })),
        });
      }
      await this.record(tx, actor, AuditAction.OpeningHoursUpdated, branchId, {
        intervals: dto.intervals.length,
      });
      const row = await tx.branch.findUniqueOrThrow({
        where: { id: branchId },
        select: branchSelect,
      });
      return toBranch(row);
    });
  }

  async updateFulfillment(
    actor: BranchActor,
    branchId: string,
    dto: FulfillmentDto,
  ): Promise<Branch> {
    const errors = [];
    if (!dto.deliveryEnabled && !dto.pickupEnabled) {
      errors.push({ field: 'pickupEnabled', message: 'Offer delivery, pickup or both' });
    }
    if (dto.deliveryEnabled && !dto.delivery) {
      errors.push({
        field: 'delivery',
        message: 'Set a delivery fee, minimum order and delivery time',
      });
    }
    if (errors.length > 0) {
      throw new ValidationFailedException(errors);
    }
    await this.assertBranch(actor.organizationId, branchId);

    return this.prisma.$transaction(async (tx) => {
      await tx.branch.update({
        where: { id: branchId },
        data: {
          deliveryEnabled: dto.deliveryEnabled,
          pickupEnabled: dto.pickupEnabled,
          preparationMinutes: dto.preparationMinutes,
        },
      });
      const zone = await tx.deliveryZone.findFirst({
        where: { organizationId: actor.organizationId, branchId, name: DEFAULT_DELIVERY_ZONE_NAME },
        select: { id: true },
      });
      if (dto.delivery) {
        const values = {
          feeMinor: dto.delivery.feeMinor,
          minOrderMinor: dto.delivery.minimumOrderMinor,
          estimatedMinutes: dto.delivery.estimatedMinutes,
          isActive: dto.deliveryEnabled,
          archivedAt: null,
        };
        if (zone) {
          await tx.deliveryZone.update({ where: { id: zone.id }, data: values });
        } else {
          await tx.deliveryZone.create({
            data: {
              organizationId: actor.organizationId,
              branchId,
              name: DEFAULT_DELIVERY_ZONE_NAME,
              ...values,
            },
          });
        }
      } else if (zone) {
        await tx.deliveryZone.update({ where: { id: zone.id }, data: { isActive: false } });
      }
      await this.record(tx, actor, AuditAction.FulfillmentUpdated, branchId, {
        deliveryEnabled: dto.deliveryEnabled,
        pickupEnabled: dto.pickupEnabled,
        preparationMinutes: dto.preparationMinutes,
      });
      const row = await tx.branch.findUniqueOrThrow({
        where: { id: branchId },
        select: branchSelect,
      });
      return toBranch(row);
    });
  }

  private async assertBranch(organizationId: string, branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId },
      select: { id: true },
    });
    if (!branch) {
      throw branchNotFound();
    }
  }

  private record(
    tx: Prisma.TransactionClient,
    actor: BranchActor,
    action: AuditAction,
    branchId: string,
    changes: Prisma.InputJsonObject,
  ): Promise<void> {
    return this.audit.record(
      {
        action,
        actorUserId: actor.auth.user.id,
        organizationId: actor.organizationId,
        entityType: 'branch',
        entityId: branchId,
        changes,
        meta: actor.meta,
      },
      tx,
    );
  }
}
