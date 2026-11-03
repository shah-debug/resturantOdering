import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorResponseSchema } from '@app/contracts';
import request from 'supertest';
import type { ErrorContext } from '../src/common/observability/error-reporter';
import { ErrorReporter } from '../src/common/observability/error-reporter';
import { Public } from '../src/modules/auth/http/decorators';
import { createTestApp } from './create-test-app';

@Public()
@Controller('observability-probe')
class ProbeController {
  @Get('boom')
  boom(): never {
    throw new Error('database password is hunter2');
  }
}

describe('observability (e2e)', () => {
  let app: NestExpressApplication;
  const reports: { error: unknown; context: ErrorContext }[] = [];

  beforeAll(async () => {
    app = await createTestApp({
      controllers: [ProbeController],
      overrides: [
        {
          provide: ErrorReporter,
          useValue: {
            report: (error: unknown, context: ErrorContext) => reports.push({ error, context }),
          },
        },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('gives every response a request id and keeps a valid one from the load balancer', async () => {
    const fresh = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(fresh.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const kept = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'edge-0123456789')
      .expect(200);
    expect(kept.headers['x-request-id']).toBe('edge-0123456789');
  });

  it('reports unexpected errors with the request id but hides details from the client', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/observability-probe/boom?token=secret-value')
      .expect(500);
    const body = apiErrorResponseSchema.parse(response.body);
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(reports).toHaveLength(1);
    expect(reports[0]?.context).toEqual({
      source: 'http',
      requestId: response.headers['x-request-id'] as string,
      method: 'GET',
      path: '/api/v1/observability-probe/boom',
    });
    expect(JSON.stringify(reports[0]?.context)).not.toContain('secret-value');
  });

  it('does not report client errors', async () => {
    reports.length = 0;
    await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(reports).toHaveLength(0);
  });
});
