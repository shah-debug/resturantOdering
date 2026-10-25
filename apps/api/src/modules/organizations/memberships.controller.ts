import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Member, Paginated } from '@app/contracts';
import type { Request } from 'express';
import { OrganizationRoute } from '../access/organization-access.guard.js';
import { Permission } from '../access/permissions.js';
import { CurrentAuth, CurrentOrganization } from '../auth/http/decorators.js';
import {
  type AuthContext,
  type OrganizationAccess,
  requestMeta,
} from '../auth/http/request-context.js';
import { InviteMemberDto, PaginationQueryDto, UpdateMemberDto } from './dto/organization.dto.js';
import { MembershipsService } from './memberships.service.js';

@Controller('organizations/:organizationId/members')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  @OrganizationRoute(Permission.MembersRead)
  list(
    @CurrentOrganization() access: OrganizationAccess,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<Member>> {
    return this.memberships.list(access.organizationId, query.page, query.pageSize);
  }

  @Post()
  @OrganizationRoute(Permission.MembersManage)
  invite(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Body() dto: InviteMemberDto,
    @Req() request: Request,
  ): Promise<Member> {
    return this.memberships.invite(auth, access, dto, requestMeta(request));
  }

  @Patch(':membershipId')
  @OrganizationRoute(Permission.MembersManage)
  update(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @Body() dto: UpdateMemberDto,
    @Req() request: Request,
  ): Promise<Member> {
    return this.memberships.update(auth, access, membershipId, dto, requestMeta(request));
  }

  @Delete(':membershipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @OrganizationRoute(Permission.MembersManage)
  remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.memberships.remove(auth, access, membershipId, requestMeta(request));
  }
}
