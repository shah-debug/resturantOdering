import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { Rider } from '@app/contracts';
import type { Request } from 'express';
import { OrganizationRoute } from '../access/organization-access.guard.js';
import { Permission } from '../access/permissions.js';
import { CurrentAuth, CurrentOrganization } from '../auth/http/decorators.js';
import {
  type AuthContext,
  type OrganizationAccess,
  requestMeta,
} from '../auth/http/request-context.js';
import { RidersService } from './riders.service.js';

@Controller('organizations/:organizationId/riders')
export class RidersController {
  constructor(private readonly riders: RidersService) {}

  @Get()
  @OrganizationRoute(Permission.RidersRead)
  list(
    @CurrentOrganization() access: OrganizationAccess,
    @Query() query: unknown,
  ): Promise<Rider[]> {
    return this.riders.list(access, query);
  }

  @Post()
  @OrganizationRoute(Permission.RidersManage)
  create(
    @CurrentOrganization() access: OrganizationAccess,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<Rider> {
    return this.riders.create(access, auth, body, requestMeta(request));
  }

  @Put(':riderId')
  @OrganizationRoute(Permission.RidersManage)
  update(
    @CurrentOrganization() access: OrganizationAccess,
    @CurrentAuth() auth: AuthContext,
    @Param('riderId') riderId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<Rider> {
    return this.riders.update(access, auth, riderId, body, requestMeta(request));
  }

  @Patch(':riderId')
  @OrganizationRoute(Permission.RidersManage)
  patch(
    @CurrentOrganization() access: OrganizationAccess,
    @CurrentAuth() auth: AuthContext,
    @Param('riderId') riderId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<Rider> {
    return this.riders.patch(access, auth, riderId, body, requestMeta(request));
  }
}
