import { Module } from '@nestjs/common';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { PlatformRoleGuard } from '../access/platform-role.guard.js';
import { MembershipsController } from './memberships.controller.js';
import { MembershipsService } from './memberships.service.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';
import { PlatformOrganizationsController } from './platform.controller.js';

@Module({
  controllers: [OrganizationsController, MembershipsController, PlatformOrganizationsController],
  providers: [OrganizationsService, MembershipsService, OrganizationAccessGuard, PlatformRoleGuard],
})
export class OrganizationsModule {}
