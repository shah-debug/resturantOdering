import type { Env } from './env.js';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  sensitiveWindowMs: number;
  sensitiveMaxRequests: number;
}

export interface DatabaseConfig {
  url: string;
  sslCaPath: string | undefined;
  poolMax: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
  healthTimeoutMs: number;
}

export interface AuthConfig {
  sessionCookieName: string;
  secureCookies: boolean;
  sessionTtlMs: number;
  sessionIdleTimeoutMs: number;
  lockoutThreshold: number;
  lockoutDurationMs: number;
}

export interface MailConfig {
  transport: Env['MAIL_TRANSPORT'];
  from: string;
  resendApiKey: string | undefined;
}

const HOUR_MS = 60 * 60 * 1000;

export class AppConfig {
  constructor(private readonly env: Env) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.env.NODE_ENV;
  }

  get port(): number {
    return this.env.PORT;
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get trustProxyHops(): number {
    return this.env.TRUST_PROXY_HOPS;
  }

  get rateLimit(): RateLimitConfig {
    return {
      windowMs: this.env.RATE_LIMIT_WINDOW_SECONDS * 1000,
      maxRequests: this.env.RATE_LIMIT_MAX_REQUESTS,
      sensitiveWindowMs: this.env.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000,
      sensitiveMaxRequests: this.env.AUTH_RATE_LIMIT_MAX_REQUESTS,
    };
  }

  get database(): DatabaseConfig {
    return {
      url: this.env.DATABASE_URL,
      sslCaPath: this.env.DATABASE_SSL_CA_PATH,
      poolMax: this.env.DATABASE_POOL_MAX,
      connectionTimeoutMs: this.env.DATABASE_CONNECTION_TIMEOUT_MS,
      statementTimeoutMs: this.env.DATABASE_STATEMENT_TIMEOUT_MS,
      healthTimeoutMs: this.env.DATABASE_HEALTH_TIMEOUT_MS,
    };
  }

  get appOrigins(): readonly string[] {
    return this.env.APP_ORIGINS;
  }

  get dashboardUrl(): string {
    return this.env.DASHBOARD_URL.replace(/\/$/, '');
  }

  get auth(): AuthConfig {
    return {
      sessionCookieName: this.isProduction ? '__Host-session' : 'session',
      secureCookies: this.isProduction,
      sessionTtlMs: this.env.SESSION_TTL_HOURS * HOUR_MS,
      sessionIdleTimeoutMs: this.env.SESSION_IDLE_TIMEOUT_HOURS * HOUR_MS,
      lockoutThreshold: this.env.AUTH_LOCKOUT_THRESHOLD,
      lockoutDurationMs: this.env.AUTH_LOCKOUT_MINUTES * 60 * 1000,
    };
  }

  get mail(): MailConfig {
    return {
      transport: this.env.MAIL_TRANSPORT,
      from: this.env.MAIL_FROM,
      resendApiKey: this.env.RESEND_API_KEY,
    };
  }
}
