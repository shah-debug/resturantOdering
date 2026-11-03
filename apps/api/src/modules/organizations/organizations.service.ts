import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type Organization,
  organizationSlugSchema,
  RESERVED_ORGANIZATION_SLUGS,
  type SlugAvailability,
} from '@app/contracts';
import { AppException, ValidationFailedException } from '../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { MembershipRole, MembershipStatus } from '../../generated/prisma/enums.js';
import { organizationNotFound } from '../access/organization-access.guard.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { startSubscription } from '../billing/subscription-factory.js';
import type { AuthContext, RequestMeta } from '../auth/http/request-context.js';
import type { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto.js';
import { organizationSelect, toOrganization } from './organization.mappers.js';

export const REPEAT_TRIAL_DAYS = 1;

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
        const defaultPlan = await tx.plan.findFirst({ where: { isDefault: true, isActive: true } });
        if (defaultPlan && defaultPlan.trialDays > 0) {
          const now = new Date();
          const trialAlreadyUsed =
            (await tx.subscription.count({
              where: {
                trialEndsAt: { not: null },
                organization: {
                  memberships: { some: { userId: auth.user.id, role: MembershipRole.OWNER } },
                },
              },
            })) > 0;
          const trialDays = trialAlreadyUsed ? REPEAT_TRIAL_DAYS : defaultPlan.trialDays;
          const trial = await startSubscription(tx, {
            organizationId: organization.id,
            timezone: organization.timezone,
            plan: defaultPlan,
            status: 'TRIALING',
            trialDays,
            now,
          });
          await this.audit.record(
            {
              action: AuditAction.BillingTrialStarted,
              actorUserId: auth.user.id,
              organizationId: organization.id,
              entityType: 'subscription',
              entityId: trial.id,
              changes: { plan: defaultPlan.code, trialDays, trialAlreadyUsed },
              meta,
            },
            tx,
          );
        }
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
