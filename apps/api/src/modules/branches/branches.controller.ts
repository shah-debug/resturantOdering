import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Req } from '@nestjs/common';
import type { Branch } from '@app/contracts';
import type { Request } from 'express';
import { OrganizationRoute } from '../access/organization-access.guard.js';
import { Permission } from '../access/permissions.js';
import { CurrentAuth, CurrentOrganization } from '../auth/http/decorators.js';
import {
  type AuthContext,
  type OrganizationAccess,
  requestMeta,
} from '../auth/http/request-context.js';
import { type BranchActor, BranchesService } from './branches.service.js';
import {
  CreateBranchDto,
  FulfillmentDto,
  OpeningHoursDto,
  UpdateBranchDto,
} from './dto/branch.dto.js';

function actorOf(auth: AuthContext, access: OrganizationAccess, request: Request): BranchActor {
  return { auth, organizationId: access.organizationId, meta: requestMeta(request) };
}

@Controller('organizations/:organizationId/branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @OrganizationRoute(Permission.BranchesRead)
  list(@CurrentOrganization() access: OrganizationAccess): Promise<Branch[]> {
    return this.branches.list(access.organizationId);
  }

  @Post()
  @OrganizationRoute(Permission.BranchesManage)
  create(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Body() dto: CreateBranchDto,
    @Req() request: Request,
  ): Promise<Branch> {
    return this.branches.create(actorOf(auth, access, request), dto);
  }

  @Get(':branchId')
  @OrganizationRoute(Permission.BranchesRead)
  get(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
  ): Promise<Branch> {
    return this.branches.get(access.organizationId, branchId);
  }

  @Patch(':branchId')
  @OrganizationRoute(Permission.BranchesManage)
  update(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Body() dto: UpdateBranchDto,
    @Req() request: Request,
  ): Promise<Branch> {
    return this.branches.update(actorOf(auth, access, request), branchId, dto);
  }

  @Put(':branchId/opening-hours')
  @OrganizationRoute(Permission.BranchesManage)
  replaceOpeningHours(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Body() dto: OpeningHoursDto,
    @Req() request: Request,
  ): Promise<Branch> {
    return this.branches.replaceOpeningHours(actorOf(auth, access, request), branchId, dto);
  }

  @Put(':branchId/fulfillment')
  @OrganizationRoute(Permission.BranchesManage)
  updateFulfillment(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Body() dto: FulfillmentDto,
    @Req() request: Request,
  ): Promise<Branch> {
    return this.branches.updateFulfillment(actorOf(auth, access, request), branchId, dto);
  }
}
