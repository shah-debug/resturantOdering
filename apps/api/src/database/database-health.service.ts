import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { DatabaseHealth } from '@app/contracts';
import { AppConfig } from '../config/app-config.js';
import { PrismaService } from './prisma.service.js';

export class DatabaseTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Database did not respond within ${timeoutMs}ms`);
  }
}

export function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DatabaseTimeoutError(timeoutMs)), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

@Injectable()
export class DatabaseHealthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async check(): Promise<DatabaseHealth> {
    const startedAt = performance.now();
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, this.config.database.healthTimeoutMs);
      return { status: 'up', latencyMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      this.logger.warn(
        `Database health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: 'down', latencyMs: Math.round(performance.now() - startedAt) };
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.nodeEnv === 'test') {
      return;
    }
    const health = await this.check();
    if (health.status === 'up') {
      this.logger.log(`Database reachable (${health.latencyMs}ms)`);
    } else {
      this.logger.error(
        'Database unreachable at startup; readiness checks will report unavailable',
      );
    }
  }
}
