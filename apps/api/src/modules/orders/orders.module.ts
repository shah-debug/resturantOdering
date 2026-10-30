import { Module } from '@nestjs/common';
import { OrganizationAccessGuard } from '../access/organization-access.guard.js';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';
import { OrderEventsService } from './order-events.service.js';
import { OrderOperationsController } from './order-operations.controller.js';
import { OrderOperationsService } from './order-operations.service.js';

@Module({
  controllers: [CheckoutController, OrderOperationsController],
  providers: [CheckoutService, OrderEventsService, OrderOperationsService, OrganizationAccessGuard],
  exports: [OrderEventsService],
})
export class OrdersModule {}
