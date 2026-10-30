import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { CheckoutQuote, OrderTracking, PlacedOrder } from '@app/contracts';
import type { Response } from 'express';
import { Public, SensitiveRateLimit } from '../auth/http/decorators.js';
import { StorefrontRateLimit } from '../storefront/storefront-rate-limit.js';
import { CheckoutService } from './checkout.service.js';

@Public()
@Controller('storefront/restaurants/:slug')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('checkout/quote')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  quote(@Param('slug') slug: string, @Body() body: unknown): Promise<CheckoutQuote> {
    return this.checkout.quote(slug, body);
  }

  @Post('orders')
  @SensitiveRateLimit()
  @Header('Cache-Control', 'no-store')
  async placeOrder(
    @Param('slug') slug: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PlacedOrder> {
    const result = await this.checkout.placeOrder(slug, idempotencyKey, body);
    response.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    if (result.replayed) {
      response.setHeader('Idempotent-Replayed', 'true');
    }
    return result.order;
  }

  @Get('orders/:orderId')
  @StorefrontRateLimit()
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  track(
    @Param('slug') slug: string,
    @Param('orderId') orderId: string,
    @Headers('x-order-token') token: string | undefined,
  ): Promise<OrderTracking> {
    return this.checkout.track(slug, orderId, token);
  }

  @Post('orders/:orderId/cancel')
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  cancel(
    @Param('slug') slug: string,
    @Param('orderId') orderId: string,
    @Headers('x-order-token') token: string | undefined,
  ): Promise<OrderTracking> {
    return this.checkout.cancel(slug, orderId, token);
  }
}
