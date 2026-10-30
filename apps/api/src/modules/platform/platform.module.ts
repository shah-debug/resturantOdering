import { Module } from '@nestjs/common';
import { PlatformRoleGuard } from '../access/platform-role.guard.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';

@Module({
  imports: [OrdersModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformRoleGuard],
})
export class PlatformModule {}
