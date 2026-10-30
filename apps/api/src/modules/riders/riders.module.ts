import { Module } from '@nestjs/common';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { RidersController } from './riders.controller.js';
import { RidersService } from './riders.service.js';

@Module({
  controllers: [RidersController],
  providers: [RidersService, OrganizationAccessGuard],
})
export class RidersModule {}
