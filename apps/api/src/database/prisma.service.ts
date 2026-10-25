import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from '../config/app-config.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { createPgPoolConfig } from './pg-pool-config.js';

const logger = new Logger('PrismaService');

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super({
      adapter: new PrismaPg(createPgPoolConfig(config.database), {
        onPoolError: (error) => logger.error(`Idle database client error: ${error.message}`),
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
