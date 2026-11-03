import { Global, Module } from '@nestjs/common';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { PlatformRoleGuard } from '../access/platform-role.guard.js';
import { BillingAdminController } from './billing-admin.controller.js';
import { BillingAdminService } from './billing-admin.service.js';
import { BillingLifecycleService } from './billing-lifecycle.service.js';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { EntitlementsService } from './entitlements.service.js';

@Global()
@Module({
  controllers: [BillingController, BillingAdminController],
  providers: [
    EntitlementsService,
    BillingService,
    BillingAdminService,
    BillingLifecycleService,
    OrganizationAccessGuard,
    PlatformRoleGuard,
  ],
  exports: [EntitlementsService, BillingLifecycleService],
})
export class BillingModule {}
