import type { Env } from './env.js';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

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
    };
  }
}
