import { Controller, Get } from '@nestjs/common';
import { Public } from '../src/modules/auth/http/decorators';
import { StorefrontRateLimit } from '../src/modules/storefront/storefront-rate-limit';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorResponseSchema } from '@app/contracts';
import request from 'supertest';
import { createTestApp } from './create-test-app';

@Public()
@Controller('rate-limit-probe')
class RateLimitProbeController {
  @Get()
  probe(): { ok: true } {
    return { ok: true };
  }
}

@Public()
@Controller('storefront-probe')
class StorefrontProbeController {
  @Get()
  @StorefrontRateLimit()
  probe(): { ok: true } {
    return { ok: true };
  }
}

const LIMIT = 3;
const STOREFRONT_LIMIT = 6;
const PROBE = '/api/v1/rate-limit-probe';

function fromClient(app: NestExpressApplication, ip: string) {
  return request(app.getHttpServer()).get(PROBE).set('X-Forwarded-For', ip);
}

describe('Rate limiting (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({
      env: {
        RATE_LIMIT_MAX_REQUESTS: String(LIMIT),
        STOREFRONT_RATE_LIMIT_MAX_REQUESTS: String(STOREFRONT_LIMIT),
        TRUST_PROXY_HOPS: '1',
      },
      controllers: [RateLimitProbeController, StorefrontProbeController],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests over the limit with the standard RATE_LIMITED envelope', async () => {
    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      await fromClient(app, '203.0.113.10').expect(200);
    }

    const response = await fromClient(app, '203.0.113.10').expect(429);
    const parsed = apiErrorResponseSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.code).toBe('RATE_LIMITED');
    expect(response.headers['retry-after']).toBeDefined();
  });

  it('tracks clients separately using the address forwarded by the trusted proxy', async () => {
    await fromClient(app, '203.0.113.20').expect(200);
  });

  it('does not throttle the health check', async () => {
    for (let attempt = 0; attempt < LIMIT + 2; attempt += 1) {
      await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Forwarded-For', '203.0.113.30')
        .expect(200);
    }
  });

  it('gives public storefront reads their own, larger budget', async () => {
    const storefront = () =>
      request(app.getHttpServer())
        .get('/api/v1/storefront-probe')
        .set('X-Forwarded-For', '203.0.113.40');
    for (let attempt = 0; attempt < STOREFRONT_LIMIT; attempt += 1) {
      await storefront().expect(200);
    }
    await storefront().expect(429);
    await fromClient(app, '203.0.113.40').expect(200);
  });
});
