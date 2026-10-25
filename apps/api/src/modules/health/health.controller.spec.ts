import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type DatabaseHealth, healthResponseSchema, readinessResponseSchema } from '@app/contracts';
import type { Response } from 'express';
import { vi } from 'vitest';
import { DatabaseHealthService } from '../../database/database-health.service';
import { HealthController } from './health.controller';

async function createController(database: DatabaseHealth): Promise<HealthController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: DatabaseHealthService, useValue: { check: () => Promise.resolve(database) } },
    ],
  }).compile();
  return moduleRef.get(HealthController);
}

function fakeResponse() {
  const status = vi.fn();
  return { response: { status } as unknown as Response, status };
}

describe('HealthController', () => {
  it('returns a liveness payload matching the shared contract', async () => {
    const controller = await createController({ status: 'up', latencyMs: 1 });
    expect(healthResponseSchema.safeParse(controller.check()).success).toBe(true);
  });

  it('reports ready with 200 when the database is up', async () => {
    const controller = await createController({ status: 'up', latencyMs: 3 });
    const { response, status } = fakeResponse();
    const body = await controller.ready(response);
    expect(status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(readinessResponseSchema.parse(body)).toMatchObject({ status: 'ok' });
  });

  it('reports unavailable with 503 when the database is down', async () => {
    const controller = await createController({ status: 'down', latencyMs: 2000 });
    const { response, status } = fakeResponse();
    const body = await controller.ready(response);
    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(readinessResponseSchema.parse(body)).toMatchObject({ status: 'unavailable' });
  });
});
