import { SetMetadata } from '@nestjs/common';

export const STOREFRONT_RATE_LIMIT_KEY = 'storefront:rateLimit';

export const StorefrontRateLimit = () => SetMetadata(STOREFRONT_RATE_LIMIT_KEY, true);
