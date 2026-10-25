import { Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { OnboardingStatus } from '@app/contracts';
import type { Request } from 'express';
import { OrganizationRoute } from '../access/organization-access.guard.js';
import { Permission } from '../access/permissions.js';
import { CurrentAuth, CurrentOrganization } from '../auth/http/decorators.js';
import {
  type AuthContext,
  type OrganizationAccess,
  requestMeta,
} from '../auth/http/request-context.js';
import { OnboardingService } from './onboarding.service.js';

@Controller('organizations/:organizationId/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  @OrganizationRoute(Permission.OrganizationRead)
  status(@CurrentOrganization() access: OrganizationAccess): Promise<OnboardingStatus> {
    return this.onboarding.status(access.organizationId);
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @OrganizationRoute(Permission.OrganizationUpdate)
  complete(
    @CurrentAuth() auth: AuthContext,
    @CurrentOrganization() access: OrganizationAccess,
    @Req() request: Request,
  ): Promise<OnboardingStatus> {
    return this.onboarding.complete(auth, access.organizationId, requestMeta(request));
  }
}
