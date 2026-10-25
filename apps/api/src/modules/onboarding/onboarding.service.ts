import { HttpStatus, Injectable } from '@nestjs/common';
import type { OnboardingStatus, OnboardingStepId, ReadinessCheck } from '@app/contracts';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../database/prisma.service.js';
import { organizationNotFound } from '../access/organization-access.guard.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { AuthContext, RequestMeta } from '../auth/http/request-context.js';
import { DEFAULT_DELIVERY_ZONE_NAME } from '../branches/branch.mapper.js';

type CheckStatus = ReadinessCheck['status'];

function check(
  id: string,
  label: string,
  status: CheckStatus,
  step: OnboardingStepId | null,
  detail: string | null = null,
): ReadinessCheck {
  return { id, label, status, step, detail };
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async status(organizationId: string): Promise<OnboardingStatus> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        description: true,
        contactPhone: true,
        logoUrl: true,
        onboardingCompletedAt: true,
        branches: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 1,
          select: {
            id: true,
            phone: true,
            addressLine: true,
            city: true,
            deliveryEnabled: true,
            pickupEnabled: true,
            _count: { select: { openingHours: true } },
            deliveryZones: {
              where: { name: DEFAULT_DELIVERY_ZONE_NAME, isActive: true, archivedAt: null },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    });
    if (!organization) {
      throw organizationNotFound();
    }

    const branch = organization.branches[0] ?? null;
    const hasDescription = Boolean(organization.description);
    const hasContactPhone = Boolean(organization.contactPhone);
    const hasBranch = Boolean(branch?.phone && branch.addressLine && branch.city);
    const hasHours = (branch?._count.openingHours ?? 0) > 0;
    const hasFulfillment = Boolean(
      branch &&
      (branch.deliveryEnabled || branch.pickupEnabled) &&
      (!branch.deliveryEnabled || branch.deliveryZones.length > 0),
    );

    const done = (value: boolean): CheckStatus => (value ? 'complete' : 'missing');
    const checks: ReadinessCheck[] = [
      check('description', 'Restaurant description', done(hasDescription), 'profile'),
      check('contact_phone', 'Contact phone number', done(hasContactPhone), 'profile'),
      check(
        'logo',
        'Logo',
        organization.logoUrl ? 'complete' : 'recommended',
        'profile',
        organization.logoUrl ? null : 'Restaurants with a logo are easier to recognise',
      ),
      check('branch', 'Branch address and phone', done(hasBranch), 'branch'),
      check('opening_hours', 'Opening hours', done(hasHours), 'hours'),
      check(
        'fulfillment',
        'Delivery or pickup settings',
        done(hasFulfillment),
        'fulfillment',
        branch?.deliveryEnabled && !hasFulfillment
          ? 'Set your delivery fee and delivery time'
          : null,
      ),
      check('menu', 'Menu', 'upcoming', null, 'Menu management arrives in the next phase'),
    ];

    const canComplete = checks.every((item) => item.status !== 'missing');
    const steps: OnboardingStatus['steps'] = [
      { id: 'restaurant', complete: true },
      { id: 'profile', complete: hasDescription && hasContactPhone },
      { id: 'branch', complete: hasBranch },
      { id: 'hours', complete: hasHours },
      { id: 'fulfillment', complete: hasFulfillment },
      { id: 'review', complete: organization.onboardingCompletedAt !== null },
    ];

    return {
      organizationId,
      completedAt: organization.onboardingCompletedAt?.toISOString() ?? null,
      primaryBranchId: branch?.id ?? null,
      steps,
      checks,
      canComplete,
    };
  }

  async complete(
    auth: AuthContext,
    organizationId: string,
    meta: RequestMeta,
  ): Promise<OnboardingStatus> {
    const current = await this.status(organizationId);
    if (!current.canComplete) {
      const missing = current.checks.filter((item) => item.status === 'missing');
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        `Finish these steps first: ${missing.map((item) => item.label).join(', ')}`,
        missing.map((item) => ({ field: item.id, message: `${item.label} is required` })),
      );
    }
    if (current.completedAt) {
      return current;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { onboardingCompletedAt: new Date() },
      });
      await this.audit.record(
        {
          action: AuditAction.OnboardingCompleted,
          actorUserId: auth.user.id,
          organizationId,
          entityType: 'organization',
          entityId: organizationId,
          meta,
        },
        tx,
      );
    });
    return this.status(organizationId);
  }
}
