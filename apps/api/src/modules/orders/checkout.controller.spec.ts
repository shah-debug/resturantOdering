import { SENSITIVE_RATE_LIMIT_KEY } from '../auth/http/decorators';
import { STOREFRONT_RATE_LIMIT_KEY } from '../storefront/storefront-rate-limit';
import { CheckoutController } from './checkout.controller';

function metadata(key: string, handler: keyof CheckoutController): unknown {
  return Reflect.getMetadata(
    key,
    Object.getOwnPropertyDescriptor(CheckoutController.prototype, handler)?.value as object,
  );
}

describe('CheckoutController rate limits', () => {
  it('uses the strict per-IP limit for placing and cancelling orders', () => {
    expect(metadata(SENSITIVE_RATE_LIMIT_KEY, 'placeOrder')).toBe(true);
    expect(metadata(SENSITIVE_RATE_LIMIT_KEY, 'cancel')).toBe(true);
  });

  it('uses the storefront budget for server-rendered tracking pages', () => {
    expect(metadata(STOREFRONT_RATE_LIMIT_KEY, 'track')).toBe(true);
  });
});
