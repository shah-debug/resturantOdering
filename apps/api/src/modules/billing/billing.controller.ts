import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type BillingOverview,
  EVIDENCE_MAX_BYTES,
  type SubscriptionPaymentRecord,
  type SubscriptionState,
} from '@app/contracts';
import type { Request, Response } from 'express';
import { OrganizationRoute } from '../access/organization-access.guard.js';
import { Permission } from '../access/permissions.js';
import { CurrentAuth, CurrentOrganization } from '../auth/http/decorators.js';
import {
  type AuthContext,
  type OrganizationAccess,
  requestMeta,
} from '../auth/http/request-context.js';
import { BillingService, type UploadedEvidence } from './billing.service.js';

export function sendEvidence(
  response: Response,
  evidence: { body: Buffer; contentType: string; filename: string },
): StreamableFile {
  response.setHeader('Content-Type', evidence.contentType);
  response.setHeader('Content-Disposition', `inline; filename="${evidence.filename}"`);
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
  );
  return new StreamableFile(evidence.body);
}

@Controller('organizations/:organizationId')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('subscription')
  @OrganizationRoute(Permission.OrganizationRead)
  @Header('Cache-Control', 'no-store')
  state(@CurrentOrganization() access: OrganizationAccess): Promise<SubscriptionState> {
    return this.billing.state(access);
  }

  @Get('billing')
  @OrganizationRoute(Permission.BillingRead)
  @Header('Cache-Control', 'no-store')
  overview(@CurrentOrganization() access: OrganizationAccess): Promise<BillingOverview> {
    return this.billing.overview(access);
  }

  @Post('billing/payments')
  @OrganizationRoute(Permission.BillingManage)
  @UseInterceptors(
    FileInterceptor('evidence', {
      limits: { fileSize: EVIDENCE_MAX_BYTES, files: 1, fields: 8, parts: 9, fieldSize: 4096 },
    }),
  )
  submit(
    @CurrentOrganization() access: OrganizationAccess,
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @UploadedFile() file: UploadedEvidence | undefined,
    @Req() request: Request,
  ): Promise<SubscriptionPaymentRecord> {
    return this.billing.submitPayment(access, auth, body, file, requestMeta(request));
  }

  @Get('billing/payments/:paymentId/evidence')
  @OrganizationRoute(Permission.BillingRead)
  async evidence(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('paymentId') paymentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return sendEvidence(response, await this.billing.evidence(access.organizationId, paymentId));
  }
}
