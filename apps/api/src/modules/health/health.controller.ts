import { Controller, Get, HttpStatus, type OnModuleDestroy, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/http/decorators.js';
import type { HealthResponse, ReadinessResponse } from '@app/contracts';
import type { Response } from 'express';
import { DatabaseHealthService } from '../../database/database-health.service.js';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController implements OnModuleDestroy {
  private draining = false;

  constructor(private readonly databaseHealth: DatabaseHealthService) {}

  onModuleDestroy(): void {
    this.draining = true;
  }

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponse> {
    const database = await this.databaseHealth.check();
    const ready = database.status === 'up' && !this.draining;
    response.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ready ? 'ok' : 'unavailable',
      checks: { database },
      timestamp: new Date().toISOString(),
    };
  }
}
