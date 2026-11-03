import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { ErrorReporter } from './common/observability/error-reporter.js';
import { AppConfig } from './config/app-config.js';

async function bootstrap(logger: ConsoleLogger): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });
  configureApp(app);

  const errors = app.get(ErrorReporter);
  process.on('unhandledRejection', (reason) => {
    errors.report(reason, { source: 'process', task: 'unhandledRejection' });
  });
  process.on('uncaughtException', (error) => {
    errors.report(error, { source: 'process', task: 'uncaughtException' });
    void app.close().finally(() => process.exit(1));
  });

  const config = app.get(AppConfig);
  await app.listen(config.port);
}

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const logger = new ConsoleLogger({
  json:
    (process.env.LOG_FORMAT ?? (process.env.NODE_ENV === 'production' ? 'json' : 'pretty')) ===
    'json',
});
bootstrap(logger).catch((error: unknown) => {
  logger.error('API failed to start', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
