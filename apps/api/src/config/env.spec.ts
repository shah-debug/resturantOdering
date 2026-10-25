import { parseEnv } from './env';

describe('parseEnv', () => {
  it('applies defaults when values are absent', () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      TRUST_PROXY_HOPS: 1,
      RATE_LIMIT_WINDOW_SECONDS: 60,
      RATE_LIMIT_MAX_REQUESTS: 100,
    });
  });

  it('coerces numeric values from strings', () => {
    expect(
      parseEnv({
        NODE_ENV: 'production',
        PORT: '8080',
        TRUST_PROXY_HOPS: '2',
        RATE_LIMIT_WINDOW_SECONDS: '30',
        RATE_LIMIT_MAX_REQUESTS: '20',
      }),
    ).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      TRUST_PROXY_HOPS: 2,
      RATE_LIMIT_WINDOW_SECONDS: 30,
      RATE_LIMIT_MAX_REQUESTS: 20,
    });
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => parseEnv({ NODE_ENV: 'staging' })).toThrow(/Invalid environment configuration/);
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => parseEnv({ PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects a non-positive rate limit', () => {
    expect(() => parseEnv({ RATE_LIMIT_MAX_REQUESTS: '0' })).toThrow(/RATE_LIMIT_MAX_REQUESTS/);
  });

  it('rejects a negative proxy hop count', () => {
    expect(() => parseEnv({ TRUST_PROXY_HOPS: '-1' })).toThrow(/TRUST_PROXY_HOPS/);
  });
});
