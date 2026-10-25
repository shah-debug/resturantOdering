import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorResponseSchema, healthResponseSchema } from '@app/contracts';
import request from 'supertest';
import { createTestApp } from './create-test-app';

describe('API (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns the health contract', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(healthResponseSchema.safeParse(response.body).success).toBe(true);
  });

  it('sets security headers', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    const parsed = apiErrorResponseSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ code: 'NOT_FOUND', path: '/api/v1/does-not-exist' });
  });

  it('does not serve routes outside the API prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
