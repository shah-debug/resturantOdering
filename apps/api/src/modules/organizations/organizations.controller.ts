import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Organization, SlugAvailability } from '@app/contracts';
import type { Request } from 'express';
import { OrganizationRoute } from '../access/organization-access.guard.js';
import { Permission } from '../access/permissions.js';
import { CurrentAuth } from '../auth/http/decorators.js';
import { type AuthContext, requestMeta } from '../auth/http/request-context.js';
import {
  CreateOrganizationDto,
  SlugAvailabilityQueryDto,
  UpdateOrganizationDto,
} from './dto/organization.dto.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateOrganizationDto,
    @Req() request: Request,
  ): Promise<Organization> {
    return this.organizations.create(auth, dto, requestMeta(request));
  }

  @Get('slug-availability')
  checkSlug(@Query() query: SlugAvailabilityQueryDto): Promise<SlugAvailability> {
    return this.organizations.checkSlug(query.slug);
  }

  @Get()
  listMine(@CurrentAuth() auth: AuthContext): Promise<Organization[]> {
    return this.organizations.listForUser(auth.user.id);
  }

  @Get(':organizationId')
  @OrganizationRoute(Permission.OrganizationRead)
  get(@Param('organizationId') organizationId: string): Promise<Organization> {
    return this.organizations.get(organizationId);
  }

  @Patch(':organizationId')
  @OrganizationRoute(Permission.OrganizationUpdate)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateOrganizationDto,
    @Req() request: Request,
  ): Promise<Organization> {
    return this.organizations.update(auth, organizationId, dto, requestMeta(request));
  }
}
