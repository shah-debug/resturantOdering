import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@app/contracts';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('returns a payload matching the shared contract', () => {
    const result = healthResponseSchema.safeParse(controller.check());
    expect(result.success).toBe(true);
  });
});
