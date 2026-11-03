import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Paginated, PlatformPayment } from '@app/contracts';
import type { Request, Response } from 'express';
import { PlatformRole } from '../../generated/prisma/enums.js';
import { PlatformRoute } from '../access/platform-role.guard.js';
import { CurrentAuth } from '../auth/http/decorators.js';
import { type AuthContext, requestMeta } from '../auth/http/request-context.js';
import { BillingAdminService } from './billing-admin.service.js';
import { sendEvidence } from './billing.controller.js';
import type { LifecycleResult } from './billing-lifecycle.service.js';
import { BillingService } from './billing.service.js';

@Controller('platform')
export class BillingAdminController {
  constructor(
    private readonly admin: BillingAdminService,
    private readonly billing: BillingService,
  ) {}

  @Get('billing/payments')
  @PlatformRoute(PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT)
  payments(@Query() query: unknown): Promise<Paginated<PlatformPayment>> {
    return this.admin.listPayments(query);
  }

  @Get('billing/payments/:paymentId/evidence')
  @PlatformRoute(PlatformRole.SUPER_ADMIN, PlatformRole.SUPPORT)
  async evidence(
    @Param('paymentId') paymentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return sendEvidence(response, await this.billing.evidence(null, paymentId));
  }

  @Post('billing/payments/:paymentId/review')
  @PlatformRoute(PlatformRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  review(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<PlatformPayment> {
    return this.admin.review(auth, paymentId, body, requestMeta(request));
  }

  @Post('organizations/:organizationId/subscription/cancel')
  @PlatformRoute(PlatformRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<void> {
    return this.admin.cancel(auth, organizationId, body, requestMeta(request));
  }

  @Patch('plans/:planId')
  @PlatformRoute(PlatformRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  updatePlan(
    @CurrentAuth() auth: AuthContext,
    @Param('planId') planId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<void> {
    return this.admin.updatePlan(auth, planId, body, requestMeta(request));
  }

  @Post('billing/run')
  @PlatformRoute(PlatformRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  run(@CurrentAuth() auth: AuthContext, @Req() request: Request): Promise<LifecycleResult> {
    return this.admin.runLifecycle(auth, requestMeta(request));
  }
}
