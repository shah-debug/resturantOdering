import { Controller, Get, Header, Query, Req, Res } from '@nestjs/common';
import type { SalesReport } from '@app/contracts';
import type { Request, Response } from 'express';
import { OrganizationRoute } from '../access/organization-access.guard.js';
import { Permission } from '../access/permissions.js';
import { CurrentAuth, CurrentOrganization } from '../auth/http/decorators.js';
import {
  type AuthContext,
  type OrganizationAccess,
  requestMeta,
} from '../auth/http/request-context.js';
import { ReportsService } from './reports.service.js';

@Controller('organizations/:organizationId/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @OrganizationRoute(Permission.ReportsRead)
  @Header('Cache-Control', 'no-store')
  sales(
    @CurrentOrganization() access: OrganizationAccess,
    @Query() query: unknown,
  ): Promise<SalesReport> {
    return this.reports.sales(access, query);
  }

  @Get('orders.csv')
  @OrganizationRoute(Permission.ReportsRead)
  async ordersCsv(
    @CurrentOrganization() access: OrganizationAccess,
    @CurrentAuth() auth: AuthContext,
    @Query() query: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const csv = await this.reports.ordersCsv(access, auth, query, requestMeta(request));
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${csv.filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    return csv.body;
  }
}
