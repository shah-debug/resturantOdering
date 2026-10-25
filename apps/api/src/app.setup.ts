import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from '@app/contracts';
import helmet from 'helmet';
import { AppConfig } from './config/app-config.js';

export function configureApp(app: NestExpressApplication): NestExpressApplication {
  const config = app.get(AppConfig);
  app.set('trust proxy', config.trustProxyHops);
  app.use(helmet());
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  return app;
}
