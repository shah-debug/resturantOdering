import { type ExecutionContext, SetMetadata } from '@nestjs/common';

export const STOREFRONT_RATE_LIMIT_KEY = 'storefront:rateLimit';
export const PROMO_RATE_LIMIT_KEY = 'storefront:promoRateLimit';

export const StorefrontRateLimit = () => SetMetadata(STOREFRONT_RATE_LIMIT_KEY, true);
export const PromoRateLimit = () => SetMetadata(PROMO_RATE_LIMIT_KEY, true);

export function carriesPromoCode(context: ExecutionContext): boolean {
  if (Reflect.getMetadata(PROMO_RATE_LIMIT_KEY, context.getHandler()) !== true) {
    return false;
  }
  const body: unknown = context.switchToHttp().getRequest<{ body?: unknown }>().body;
  const code =
    typeof body === 'object' && body !== null ? (body as { promoCode?: unknown }).promoCode : null;
  return typeof code === 'string' && code.trim().length > 0;
}
