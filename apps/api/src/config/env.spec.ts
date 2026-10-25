import { parseEnv } from './env';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/app';

describe('parseEnv', () => {
  it('applies defaults when optional values are absent', () => {
    expect(parseEnv({ DATABASE_URL })).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      TRUST_PROXY_HOPS: 1,
      DATABASE_URL,
      DATABASE_POOL_MAX: 10,
      DATABASE_STATEMENT_TIMEOUT_MS: 15000,
      APP_ORIGINS: ['http://localhost:3000', 'http://localhost:3001'],
      SESSION_TTL_HOURS: 168,
      SESSION_IDLE_TIMEOUT_HOURS: 24,
      MAIL_TRANSPORT: 'log',
    });
  });

  it('coerces numeric values from strings', () => {
    expect(
      parseEnv({
        NODE_ENV: 'test',
        PORT: '8080',
        TRUST_PROXY_HOPS: '2',
        RATE_LIMIT_WINDOW_SECONDS: '30',
        RATE_LIMIT_MAX_REQUESTS: '20',
        DATABASE_URL,
        DATABASE_POOL_MAX: '5',
        DATABASE_CONNECTION_TIMEOUT_MS: '3000',
        DATABASE_HEALTH_TIMEOUT_MS: '1000',
      }),
    ).toMatchObject({
      NODE_ENV: 'test',
      PORT: 8080,
      TRUST_PROXY_HOPS: 2,
      RATE_LIMIT_WINDOW_SECONDS: 30,
      RATE_LIMIT_MAX_REQUESTS: 20,
      DATABASE_POOL_MAX: 5,
      DATABASE_CONNECTION_TIMEOUT_MS: 3000,
      DATABASE_HEALTH_TIMEOUT_MS: 1000,
    });
  });

  it('requires DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-Postgres DATABASE_URL', () => {
    expect(() => parseEnv({ DATABASE_URL: 'mysql://user:pass@localhost/app' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => parseEnv({ DATABASE_URL, NODE_ENV: 'staging' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => parseEnv({ DATABASE_URL, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects a non-positive rate limit', () => {
    expect(() => parseEnv({ DATABASE_URL, RATE_LIMIT_MAX_REQUESTS: '0' })).toThrow(
      /RATE_LIMIT_MAX_REQUESTS/,
    );
  });

  it('rejects a negative proxy hop count', () => {
    expect(() => parseEnv({ DATABASE_URL, TRUST_PROXY_HOPS: '-1' })).toThrow(/TRUST_PROXY_HOPS/);
  });

  it('rejects an oversized connection pool', () => {
    expect(() => parseEnv({ DATABASE_URL, DATABASE_POOL_MAX: '500' })).toThrow(/DATABASE_POOL_MAX/);
  });

  describe('production rules', () => {
    const production = {
      NODE_ENV: 'production',
      DATABASE_URL,
      DATABASE_SSL_CA_PATH: '/etc/ssl/supabase-ca.crt',
      APP_ORIGINS: 'https://app.example.com',
      MAIL_TRANSPORT: 'resend',
      RESEND_API_KEY: 're_test_key',
      STORAGE_DRIVER: 'supabase',
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value-123',
    };

    it('accepts a complete production configuration', () => {
      expect(parseEnv(production)).toMatchObject({ APP_ORIGINS: ['https://app.example.com'] });
    });

    it('requires a database CA certificate', () => {
      expect(() => parseEnv({ ...production, DATABASE_SSL_CA_PATH: undefined })).toThrow(
        /DATABASE_SSL_CA_PATH/,
      );
    });

    it('rejects local file storage', () => {
      expect(() => parseEnv({ ...production, STORAGE_DRIVER: 'local' })).toThrow(/STORAGE_DRIVER/);
    });

    it('rejects the log mail transport', () => {
      expect(() => parseEnv({ ...production, MAIL_TRANSPORT: 'log' })).toThrow(/MAIL_TRANSPORT/);
    });

    it('rejects plain-http origins', () => {
      expect(() => parseEnv({ ...production, APP_ORIGINS: 'http://app.example.com' })).toThrow(
        /https/,
      );
    });
  });

  it('rejects sslmode in DATABASE_URL when a CA certificate is configured', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: DATABASE_URL + '?sslmode=require',
        DATABASE_SSL_CA_PATH: '/ca.crt',
      }),
    ).toThrow(/sslmode/);
  });

  it('rejects origins with paths or trailing slashes', () => {
    expect(() => parseEnv({ DATABASE_URL, APP_ORIGINS: 'http://localhost:3000/' })).toThrow(
      /APP_ORIGINS/,
    );
  });

  it('requires a Resend API key for the resend transport', () => {
    expect(() => parseEnv({ DATABASE_URL, MAIL_TRANSPORT: 'resend' })).toThrow(/RESEND_API_KEY/);
  });

  it('rejects an idle timeout longer than the session lifetime', () => {
    expect(() =>
      parseEnv({ DATABASE_URL, SESSION_TTL_HOURS: '4', SESSION_IDLE_TIMEOUT_HOURS: '8' }),
    ).toThrow(/SESSION_IDLE_TIMEOUT_HOURS/);
  });
});
