import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type Organization,
  organizationSlugSchema,
  type Paginated,
  RESERVED_ORGANIZATION_SLUGS,
  type SlugAvailability,
} from '@app/contracts';
import { AppException, ValidationFailedException } from '../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { MembershipRole, MembershipStatus } from '../../generated/prisma/enums.js';
import { organizationNotFound } from '../access/organization-access.guard.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { AuthContext, RequestMeta } from '../auth/http/request-context.js';
import type { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto.js';
import { organizationSelect, toOrganization } from './organization.mappers.js';

function slugTaken(): AppException {
  return new AppException(HttpStatus.CONFLICT, 'CONFLICT', 'This address is already taken', [
    { field: 'slug', message: 'This address is already taken' },
  ]);
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    auth: AuthContext,
    dto: CreateOrganizationDto,
    meta: RequestMeta,
  ): Promise<Organization> {
    const existing = await this.prisma.organization.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (existing) {
      throw slugTaken();
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: { name: dto.name, slug: dto.slug },
          select: organizationSelect,
        });
        await tx.membership.create({
          data: {
            organizationId: organization.id,
            userId: auth.user.id,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE,
            acceptedAt: new Date(),
          },
        });
        await this.audit.record(
          {
            action: AuditAction.OrganizationCreated,
            actorUserId: auth.user.id,
            organizationId: organization.id,
            entityType: 'organization',
            entityId: organization.id,
            changes: { name: dto.name, slug: dto.slug },
            meta,
          },
          tx,
        );
        return toOrganization(organization);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw slugTaken();
      }
      throw error;
    }
  }

  async checkSlug(slug: string): Promise<SlugAvailability> {
    if ((RESERVED_ORGANIZATION_SLUGS as readonly string[]).includes(slug)) {
      return { slug, available: false, reason: 'reserved' };
    }
    if (!organizationSlugSchema.safeParse(slug).success) {
      return { slug, available: false, reason: 'invalid' };
    }
    const existing = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    return existing
      ? { slug, available: false, reason: 'taken' }
      : { slug, available: true, reason: null };
  }

  async listForUser(userId: string): Promise<Organization[]> {
    const organizations = await this.prisma.organization.findMany({
      where: { memberships: { some: { userId, status: MembershipStatus.ACTIVE } } },
      orderBy: { name: 'asc' },
      select: organizationSelect,
    });
    return organizations.map(toOrganization);
  }

  async listAll(page: number, pageSize: number): Promise<Paginated<Organization>> {
    const [total, organizations] = await this.prisma.$transaction([
      this.prisma.organization.count(),
      this.prisma.organization.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: organizationSelect,
      }),
    ]);
    return { items: organizations.map(toOrganization), page, pageSize, total };
  }

  async get(organizationId: string): Promise<Organization> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: organizationSelect,
    });
    if (!organization) {
      throw organizationNotFound();
    }
    return toOrganization(organization);
  }

  async update(
    auth: AuthContext,
    organizationId: string,
    dto: UpdateOrganizationDto,
    meta: RequestMeta,
  ): Promise<Organization> {
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    ) as UpdateOrganizationDto;
    if (Object.keys(changes).length === 0) {
      throw new ValidationFailedException([
        { field: 'body', message: 'Provide at least one field to update' },
      ]);
    }
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.update({
        where: { id: organizationId },
        data: changes,
        select: organizationSelect,
      });
      await this.audit.record(
        {
          action: AuditAction.OrganizationUpdated,
          actorUserId: auth.user.id,
          organizationId,
          entityType: 'organization',
          entityId: organizationId,
          changes: { fields: Object.keys(changes) },
          meta,
        },
        tx,
      );
      return toOrganization(organization);
    });
  }
}
