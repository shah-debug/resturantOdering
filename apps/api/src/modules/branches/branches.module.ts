import { Module } from '@nestjs/common';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { BranchesController } from './branches.controller.js';
import { BranchesService } from './branches.service.js';

@Module({
  controllers: [BranchesController],
  providers: [BranchesService, OrganizationAccessGuard],
})
export class BranchesModule {}
