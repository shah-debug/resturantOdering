import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Member, Paginated } from '@app/contracts';
import { AppException, ValidationFailedException } from '../../common/errors/app.exception.js';
import { AppConfig } from '../../config/app-config.js';
import { isUniqueViolation } from '../../database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  AuthTokenPurpose,
  MembershipRole,
  MembershipStatus,
} from '../../generated/prisma/enums.js';
import { canManageRole } from '../access/permissions.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { AuthTokenService } from '../auth/auth-token.service.js';
import type { AuthContext, OrganizationAccess, RequestMeta } from '../auth/http/request-context.js';
import { invitationEmail } from '../mail/auth-emails.js';
import { Mailer } from '../mail/mailer.js';
import type { InviteMemberDto, UpdateMemberDto } from './dto/organization.dto.js';
import { memberSelect, toMember } from './organization.mappers.js';

function memberNotFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Member not found');
}

function cannotManage(): AppException {
  return new AppException(
    HttpStatus.FORBIDDEN,
    'FORBIDDEN',
    'You cannot manage members with this role',
  );
}

function lastOwner(): AppException {
  return new AppException(
    HttpStatus.CONFLICT,
    'CONFLICT',
    'An organization must keep at least one active owner',
  );
}

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly tokens: AuthTokenService,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
  ) {}

  async list(organizationId: string, page: number, pageSize: number): Promise<Paginated<Member>> {
    const where = { organizationId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.membership.count({ where }),
      this.prisma.membership.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: memberSelect,
      }),
    ]);
    return { items: rows.map(toMember), page, pageSize, total };
  }

  async invite(
    auth: AuthContext,
    access: OrganizationAccess,
    dto: InviteMemberDto,
    meta: RequestMeta,
  ): Promise<Member> {
    if (!canManageRole(access.role, access.platformRole, dto.role)) {
      throw cannotManage();
    }
    const branchId = dto.branchId ?? null;
    await this.assertBranchInOrganization(access.organizationId, branchId);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        memberships: { where: { organizationId: access.organizationId }, select: { id: true } },
      },
    });
    if (existingUser && existingUser.memberships.length > 0) {
      throw new AppException(HttpStatus.CONFLICT, 'CONFLICT', 'This person is already a member', [
        { field: 'email', message: 'This person is already a member' },
      ]);
    }

    let result: { member: Member; token: string; organizationName: string };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const userId =
          existingUser?.id ??
          (
            await tx.user.create({
              data: { email: dto.email, fullName: dto.fullName },
              select: { id: true },
            })
          ).id;
        const membership = await tx.membership.create({
          data: {
            organizationId: access.organizationId,
            userId,
            branchId,
            role: dto.role,
            status: MembershipStatus.INVITED,
            invitedByUserId: auth.user.id,
          },
          select: { ...memberSelect, organization: { select: { name: true } } },
        });
        const token = await this.tokens.issue(
          tx,
          userId,
          AuthTokenPurpose.INVITATION,
          membership.id,
        );
        await this.audit.record(
          {
            action: AuditAction.MemberInvited,
            actorUserId: auth.user.id,
            organizationId: access.organizationId,
            entityType: 'membership',
            entityId: membership.id,
            changes: { role: dto.role, branchId, invitedUserId: userId },
            meta,
          },
          tx,
        );
        return {
          member: toMember(membership),
          token,
          organizationName: membership.organization.name,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(HttpStatus.CONFLICT, 'CONFLICT', 'This person is already a member');
      }
      throw error;
    }

    try {
      await this.mailer.send(
        invitationEmail(
          dto.email,
          this.config.dashboardUrl,
          result.token,
          result.organizationName,
          auth.user.fullName,
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to send invitation email: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return result.member;
  }

  async update(
    auth: AuthContext,
    access: OrganizationAccess,
    membershipId: string,
    dto: UpdateMemberDto,
    meta: RequestMeta,
  ): Promise<Member> {
    if (dto.role === undefined && dto.status === undefined && dto.branchId === undefined) {
      throw new ValidationFailedException([
        { field: 'body', message: 'Provide at least one field to update' },
      ]);
    }
    if (dto.branchId !== undefined) {
      await this.assertBranchInOrganization(access.organizationId, dto.branchId);
    }

    return this.prisma.$transaction(async (tx) => {
      const target = await this.loadManageableMembership(tx, auth, access, membershipId);
      if (dto.role !== undefined && !canManageRole(access.role, access.platformRole, dto.role)) {
        throw cannotManage();
      }
      if (dto.status === MembershipStatus.ACTIVE && target.status === MembershipStatus.INVITED) {
        throw new ValidationFailedException([
          {
            field: 'status',
            message: 'Invited members become active when they accept the invitation',
          },
        ]);
      }
      const losesOwnership =
        target.role === MembershipRole.OWNER &&
        target.status === MembershipStatus.ACTIVE &&
        ((dto.role !== undefined && dto.role !== MembershipRole.OWNER) ||
          dto.status === MembershipStatus.SUSPENDED);
      if (losesOwnership) {
        await this.assertAnotherActiveOwner(tx, access.organizationId, target.id);
      }

      const updated = await tx.membership.update({
        where: { id: target.id },
        data: {
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
        },
        select: memberSelect,
      });
      await this.audit.record(
        {
          action: AuditAction.MemberUpdated,
          actorUserId: auth.user.id,
          organizationId: access.organizationId,
          entityType: 'membership',
          entityId: target.id,
          changes: {
            before: { role: target.role, status: target.status, branchId: target.branchId },
            after: { role: updated.role, status: updated.status, branchId: updated.branchId },
          },
          meta,
        },
        tx,
      );
      return toMember(updated);
    });
  }

  async remove(
    auth: AuthContext,
    access: OrganizationAccess,
    membershipId: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await this.loadManageableMembership(tx, auth, access, membershipId);
      if (target.role === MembershipRole.OWNER && target.status === MembershipStatus.ACTIVE) {
        await this.assertAnotherActiveOwner(tx, access.organizationId, target.id);
      }
      await tx.membership.delete({ where: { id: target.id } });
      await this.audit.record(
        {
          action: AuditAction.MemberRemoved,
          actorUserId: auth.user.id,
          organizationId: access.organizationId,
          entityType: 'membership',
          entityId: target.id,
          changes: { userId: target.userId, role: target.role, status: target.status },
          meta,
        },
        tx,
      );
    });
  }

  private async loadManageableMembership(
    tx: Prisma.TransactionClient,
    auth: AuthContext,
    access: OrganizationAccess,
    membershipId: string,
  ) {
    const target = await tx.membership.findFirst({
      where: { id: membershipId, organizationId: access.organizationId },
      select: { id: true, userId: true, role: true, status: true, branchId: true },
    });
    if (!target) {
      throw memberNotFound();
    }
    if (target.userId === auth.user.id) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'You cannot change your own membership',
      );
    }
    if (!canManageRole(access.role, access.platformRole, target.role)) {
      throw cannotManage();
    }
    return target;
  }

  private async assertAnotherActiveOwner(
    tx: Prisma.TransactionClient,
    organizationId: string,
    excludingMembershipId: string,
  ): Promise<void> {
    const owners = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM memberships
      WHERE organization_id = ${organizationId}::uuid AND role = 'OWNER' AND status = 'ACTIVE'
      FOR UPDATE
    `;
    if (!owners.some((owner) => owner.id !== excludingMembershipId)) {
      throw lastOwner();
    }
  }

  private async assertBranchInOrganization(
    organizationId: string,
    branchId: string | null,
  ): Promise<void> {
    if (branchId === null) {
      return;
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId },
      select: { id: true },
    });
    if (!branch) {
      throw new ValidationFailedException([
        { field: 'branchId', message: 'Branch not found in this organization' },
      ]);
    }
  }
}
