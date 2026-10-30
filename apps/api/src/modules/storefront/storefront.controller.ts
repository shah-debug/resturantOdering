import { Controller, Get, Header, Param } from '@nestjs/common';
import type { Storefront, StorefrontDirectoryEntry } from '@app/contracts';
import { Public } from '../auth/http/decorators.js';
import { StorefrontRateLimit } from './storefront-rate-limit.js';
import { StorefrontService } from './storefront.service.js';

@Public()
@Controller('storefront/restaurants')
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get()
  @StorefrontRateLimit()
  @Header('Cache-Control', 'public, max-age=60')
  directory(): Promise<StorefrontDirectoryEntry[]> {
    return this.storefront.directory();
  }

  @Get(':slug')
  @StorefrontRateLimit()
  @Header('Cache-Control', 'public, max-age=30')
  restaurant(@Param('slug') slug: string): Promise<Storefront> {
    return this.storefront.findBySlug(slug);
  }
}
