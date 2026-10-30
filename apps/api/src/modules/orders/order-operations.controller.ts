import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  type MessageEvent,
  Param,
  Post,
  Put,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import type { OrderCounts, OrderDetail, OrderPage } from '@app/contracts';
import type { Request } from 'express';
import { interval, map, merge, type Observable, of, takeUntil, timer } from 'rxjs';
import { OrganizationRoute } from '../access/organization-access.guard.js';
import { Permission } from '../access/permissions.js';
import { CurrentAuth, CurrentOrganization } from '../auth/http/decorators.js';
import {
  type AuthContext,
  type OrganizationAccess,
  requestMeta,
} from '../auth/http/request-context.js';
import { OrderEventsService } from './order-events.service.js';
import { OrderOperationsService } from './order-operations.service.js';

export const SSE_HEARTBEAT_MS = 25_000;
export const SSE_MAX_CONNECTION_MS = 15 * 60_000;
export const SSE_RETRY_MS = 5_000;

@Controller('organizations/:organizationId/orders')
export class OrderOperationsController {
  constructor(
    private readonly orders: OrderOperationsService,
    private readonly events: OrderEventsService,
  ) {}

  @Get()
  @OrganizationRoute(Permission.OrdersRead)
  list(
    @CurrentOrganization() access: OrganizationAccess,
    @Query() query: unknown,
  ): Promise<OrderPage> {
    return this.orders.list(access, query);
  }

  @Get('counts')
  @OrganizationRoute(Permission.OrdersRead)
  counts(
    @CurrentOrganization() access: OrganizationAccess,
    @Query() query: unknown,
  ): Promise<OrderCounts> {
    return this.orders.counts(access, query);
  }

  @Sse('events')
  @OrganizationRoute(Permission.OrdersRead)
  @Header('X-Accel-Buffering', 'no')
  stream(@CurrentOrganization() access: OrganizationAccess): Observable<MessageEvent> {
    const ready = of<MessageEvent>({
      type: 'ready',
      retry: SSE_RETRY_MS,
      data: { at: new Date().toISOString() },
    });
    const orders = this.events
      .stream(access.organizationId, access.branchId)
      .pipe(map((event): MessageEvent => ({ type: 'order', data: event })));
    const heartbeat = interval(SSE_HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: { at: new Date().toISOString() } })),
    );
    return merge(ready, orders, heartbeat).pipe(takeUntil(timer(SSE_MAX_CONNECTION_MS)));
  }

  @Get(':orderId')
  @OrganizationRoute(Permission.OrdersRead)
  detail(
    @CurrentOrganization() access: OrganizationAccess,
    @Param('orderId') orderId: string,
  ): Promise<OrderDetail> {
    return this.orders.detail(access, orderId);
  }

  @Post(':orderId/transitions')
  @HttpCode(HttpStatus.OK)
  @OrganizationRoute(Permission.OrdersRead)
  transition(
    @CurrentOrganization() access: OrganizationAccess,
    @CurrentAuth() auth: AuthContext,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<OrderDetail> {
    return this.orders.transition(access, auth, orderId, body, requestMeta(request));
  }

  @Put(':orderId/rider')
  @OrganizationRoute(Permission.OrdersManage)
  assignRider(
    @CurrentOrganization() access: OrganizationAccess,
    @CurrentAuth() auth: AuthContext,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<OrderDetail> {
    return this.orders.assignRider(access, auth, orderId, body, requestMeta(request));
  }
}
