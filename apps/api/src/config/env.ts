import { z } from 'zod';

const postgresUrl = z
  .url()
  .refine(
    (value) => /^postgres(ql)?:\/\//.test(value),
    'Must be a postgres:// or postgresql:// URL',
  );

const originList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .pipe(
    z
      .array(
        z.url().refine((origin) => new URL(origin).origin === origin, {
          message: 'Each origin must be scheme://host[:port] with no path or trailing slash',
        }),
      )
      .min(1),
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
    DATABASE_URL: postgresUrl,
    DATABASE_SSL_CA_PATH: z.string().min(1).optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    DATABASE_HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
    APP_ORIGINS: originList.default(['http://localhost:3000', 'http://localhost:3001']),
    DASHBOARD_URL: z.url().default('http://localhost:3000'),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    SESSION_IDLE_TIMEOUT_HOURS: z.coerce.number().int().min(1).max(720).default(24),
    AUTH_LOCKOUT_THRESHOLD: z.coerce.number().int().min(3).max(100).default(10),
    AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    MAIL_TRANSPORT: z.enum(['log', 'resend']).default('log'),
    MAIL_FROM: z.string().min(3).default('Restaurant Platform <no-reply@localhost>'),
    RESEND_API_KEY: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.DATABASE_SSL_CA_PATH && /[?&]sslmode=/i.test(env.DATABASE_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message:
          'Remove sslmode from DATABASE_URL when DATABASE_SSL_CA_PATH is set; node-pg would override the CA configuration',
      });
    }
    if (env.NODE_ENV === 'production') {
      if (!env.DATABASE_SSL_CA_PATH) {
        ctx.addIssue({
          code: 'custom',
          path: ['DATABASE_SSL_CA_PATH'],
          message: 'Required in production so database connections use verified TLS',
        });
      }
      if (env.MAIL_TRANSPORT === 'log') {
        ctx.addIssue({
          code: 'custom',
          path: ['MAIL_TRANSPORT'],
          message: 'The log transport prints secrets and is not allowed in production',
        });
      }
      for (const origin of env.APP_ORIGINS) {
        if (!origin.startsWith('https://')) {
          ctx.addIssue({
            code: 'custom',
            path: ['APP_ORIGINS'],
            message: `Production origins must use https (${origin})`,
          });
        }
      }
    }
    if (env.MAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'Required when MAIL_TRANSPORT=resend',
      });
    }
    if (env.SESSION_IDLE_TIMEOUT_HOURS > env.SESSION_TTL_HOURS) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_IDLE_TIMEOUT_HOURS'],
        message: 'Must not exceed SESSION_TTL_HOURS',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
