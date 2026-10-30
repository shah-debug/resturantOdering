import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type {
  AuditEntry,
  Paginated,
  Plan,
  PlatformHealth,
  PlatformOrganization,
  PlatformOrganizationDetail,
  SubscriptionOverview,
} from '@app/contracts';
import type { Request, Response } from 'express';
import { PlatformRole } from '../../generated/prisma/enums.js';
import { PlatformRoute } from '../access/platform-role.guard.js';
import { CurrentAuth } from '../auth/http/decorators.js';
import { type AuthContext, requestMeta } from '../auth/http/request-context.js';
import { PlatformService } from './platform.service.js';

const ANY_PLATFORM_ROLE = [PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT] as const;

@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('organizations')
  @PlatformRoute(...ANY_PLATFORM_ROLE)
  list(@Query() query: unknown): Promise<Paginated<PlatformOrganization>> {
    return this.platform.listOrganizations(query);
  }

  @Get('organizations/export.csv')
  @PlatformRoute(PlatformRole.SUPER_ADMIN)
  async export(
    @CurrentAuth() auth: AuthContext,
    @Query() query: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const csv = await this.platform.exportOrganizations(auth, query, requestMeta(request));
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="restaurants.csv"');
    response.setHeader('Cache-Control', 'no-store');
    return csv;
  }

  @Get('organizations/:organizationId')
  @PlatformRoute(...ANY_PLATFORM_ROLE)
  @Header('Cache-Control', 'no-store')
  detail(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId') organizationId: string,
  ): Promise<PlatformOrganizationDetail> {
    return this.platform.organizationDetail(auth, organizationId);
  }

  @Patch('organizations/:organizationId/status')
  @PlatformRoute(PlatformRole.SUPER_ADMIN)
  changeStatus(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<PlatformOrganizationDetail> {
    return this.platform.changeStatus(auth, organizationId, body, requestMeta(request));
  }

  @Put('organizations/:organizationId/subscription')
  @PlatformRoute(PlatformRole.SUPER_ADMIN)
  assignSubscription(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<PlatformOrganizationDetail> {
    return this.platform.assignSubscription(auth, organizationId, body, requestMeta(request));
  }

  @Get('plans')
  @PlatformRoute(...ANY_PLATFORM_ROLE)
  plans(): Promise<Plan[]> {
    return this.platform.plans();
  }

  @Post('plans')
  @PlatformRoute(PlatformRole.SUPER_ADMIN)
  createPlan(
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<Plan> {
    return this.platform.createPlan(auth, body, requestMeta(request));
  }

  @Get('subscriptions/overview')
  @PlatformRoute(...ANY_PLATFORM_ROLE)
  subscriptions(): Promise<SubscriptionOverview> {
    return this.platform.subscriptionOverview();
  }

  @Get('audit-logs')
  @PlatformRoute(...ANY_PLATFORM_ROLE)
  @Header('Cache-Control', 'no-store')
  audit(@CurrentAuth() auth: AuthContext, @Query() query: unknown): Promise<Paginated<AuditEntry>> {
    return this.platform.auditLog(auth, query);
  }

  @Get('health')
  @PlatformRoute(...ANY_PLATFORM_ROLE)
  @Header('Cache-Control', 'no-store')
  health(): Promise<PlatformHealth> {
    return this.platform.health();
  }
}
