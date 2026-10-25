import type { InjectionToken, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

export interface ProviderOverride {
  provide: InjectionToken;
  useValue: unknown;
}

export interface TestAppOptions {
  env?: Record<string, string>;
  controllers?: Type[];
  overrides?: ProviderOverride[];
}

export async function createTestApp({
  env = {},
  controllers = [],
  overrides = [],
}: TestAppOptions = {}): Promise<NestExpressApplication> {
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);

  try {
    const builder = Test.createTestingModule({
      imports: [AppModule],
      controllers,
    });
    for (const override of overrides) {
      builder.overrideProvider(override.provide).useValue(override.useValue);
    }
    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    return app;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
