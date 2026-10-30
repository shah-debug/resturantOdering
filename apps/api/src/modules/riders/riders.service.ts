import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type Rider,
  riderPatchRequestSchema,
  riderStatusSchema,
  riderUpsertRequestSchema,
} from '@app/contracts';
import { z } from 'zod';
import { AppException } from '../../common/errors/app.exception.js';
import { assertValid } from '../../common/validation/schema.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { AuthContext, OrganizationAccess, RequestMeta } from '../auth/http/request-context.js';

const riderSelect = {
  id: true,
  branchId: true,
  fullName: true,
  phone: true,
  vehicleType: true,
  vehicleNumber: true,
  status: true,
  availability: true,
  createdAt: true,
  branch: { select: { name: true } },
  _count: { select: { orders: { where: { status: 'OUT_FOR_DELIVERY' } } } },
} satisfies Prisma.RiderSelect;

type RiderRow = Prisma.RiderGetPayload<{ select: typeof riderSelect }>;

const listQuerySchema = z.object({
  branchId: z.uuid().optional(),
  status: riderStatusSchema.optional(),
});

function toRider(row: RiderRow): Rider {
  return {
    id: row.id,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    fullName: row.fullName,
    phone: row.phone,
    vehicleType: row.vehicleType,
    vehicleNumber: row.vehicleNumber,
    status: row.status,
    availability: row.availability,
    activeDeliveries: row._count.orders,
    createdAt: row.createdAt.toISOString(),
  };
}

function riderNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Rider not found');
}

function fieldError(field: string, message: string, status = HttpStatus.BAD_REQUEST) {
  return new AppException(status, 'VALIDATION_FAILED', 'Request validation failed', [
    { field, message },
  ]);
}

@Injectable()
export class RidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private scope(access: OrganizationAccess): Prisma.RiderWhereInput {
    return {
      organizationId: access.organizationId,
      ...(access.branchId ? { branchId: access.branchId } : {}),
    };
  }

  async list(access: OrganizationAccess, rawQuery: unknown): Promise<Rider[]> {
    const query = assertValid(listQuerySchema, rawQuery);
    const rows = await this.prisma.rider.findMany({
      where: {
        ...this.scope(access),
        ...(query.branchId && !access.branchId ? { branchId: query.branchId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ status: 'asc' }, { fullName: 'asc' }, { id: 'asc' }],
      select: riderSelect,
    });
    return rows.map(toRider);
  }

  private async assertBranch(access: OrganizationAccess, branchId: string): Promise<void> {
    if (access.branchId && access.branchId !== branchId) {
      throw fieldError('branchId', 'You can only manage riders for your own branch');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId: access.organizationId },
      select: { id: true },
    });
    if (!branch) {
      throw fieldError('branchId', 'Choose a branch of this restaurant');
    }
  }

  private async assertPhoneFree(
    organizationId: string,
    phone: string,
    exceptId: string | null,
  ): Promise<void> {
    const existing = await this.prisma.rider.findFirst({
      where: { organizationId, phone, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'A rider with this phone already exists',
        [{ field: 'phone', message: 'A rider with this phone already exists' }],
      );
    }
  }

  private async findScoped(access: OrganizationAccess, riderId: string): Promise<RiderRow> {
    if (!z.uuid().safeParse(riderId).success) {
      throw riderNotFound();
    }
    const row = await this.prisma.rider.findFirst({
      where: { id: riderId, ...this.scope(access) },
      select: riderSelect,
    });
    if (!row) {
      throw riderNotFound();
    }
    return row;
  }

  async create(
    access: OrganizationAccess,
    auth: AuthContext,
    body: unknown,
    meta: RequestMeta,
  ): Promise<Rider> {
    const dto = assertValid(riderUpsertRequestSchema, body);
    await this.assertBranch(access, dto.branchId);
    await this.assertPhoneFree(access.organizationId, dto.phone, null);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rider.create({
        data: {
          organizationId: access.organizationId,
          branchId: dto.branchId,
          fullName: dto.fullName,
          phone: dto.phone,
          vehicleType: dto.vehicleType,
          vehicleNumber: dto.vehicleNumber ?? null,
          availability: 'AVAILABLE',
        },
        select: riderSelect,
      });
      await this.audit.record(
        {
          action: AuditAction.RiderCreated,
          actorUserId: auth.user.id,
          organizationId: access.organizationId,
          entityType: 'rider',
          entityId: created.id,
          changes: { fullName: dto.fullName, branchId: dto.branchId },
          meta,
        },
        tx,
      );
      return created;
    });
    return toRider(row);
  }

  async update(
    access: OrganizationAccess,
    auth: AuthContext,
    riderId: string,
    body: unknown,
    meta: RequestMeta,
  ): Promise<Rider> {
    const current = await this.findScoped(access, riderId);
    const dto = assertValid(riderUpsertRequestSchema, body);
    await this.assertBranch(access, dto.branchId);
    await this.assertPhoneFree(access.organizationId, dto.phone, current.id);
    if (dto.branchId !== current.branchId && current._count.orders > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'This rider is out on a delivery. Move them after it is finished.',
      );
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.rider.update({
        where: { id: current.id },
        data: {
          branchId: dto.branchId,
          fullName: dto.fullName,
          phone: dto.phone,
          vehicleType: dto.vehicleType,
          vehicleNumber: dto.vehicleNumber ?? null,
        },
        select: riderSelect,
      });
      await this.audit.record(
        {
          action: AuditAction.RiderUpdated,
          actorUserId: auth.user.id,
          organizationId: access.organizationId,
          entityType: 'rider',
          entityId: current.id,
          changes: { fullName: dto.fullName, branchId: dto.branchId },
          meta,
        },
        tx,
      );
      return updated;
    });
    return toRider(row);
  }

  async patch(
    access: OrganizationAccess,
    auth: AuthContext,
    riderId: string,
    body: unknown,
    meta: RequestMeta,
  ): Promise<Rider> {
    const current = await this.findScoped(access, riderId);
    const dto = assertValid(riderPatchRequestSchema, body);
    if (current._count.orders > 0 && (dto.status === 'INACTIVE' || dto.availability)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'This rider is out on a delivery. Finish the delivery first.',
      );
    }
    const data: Prisma.RiderUpdateInput = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.status === 'INACTIVE' ? { availability: 'OFFLINE' } : {}),
      ...(dto.availability ? { availability: dto.availability } : {}),
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.rider.update({
        where: { id: current.id },
        data,
        select: riderSelect,
      });
      await this.audit.record(
        {
          action: AuditAction.RiderUpdated,
          actorUserId: auth.user.id,
          organizationId: access.organizationId,
          entityType: 'rider',
          entityId: current.id,
          changes: { ...dto },
          meta,
        },
        tx,
      );
      return updated;
    });
    return toRider(row);
  }
}
