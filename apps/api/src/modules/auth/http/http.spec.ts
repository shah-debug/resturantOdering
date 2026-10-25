import { AppConfig } from '../../../config/app-config';
import { parseEnv } from '../../../config/env';
import { clearedSessionCookieOptions, parseCookieHeader, sessionCookieOptions } from './cookies';
import { isTrustedRequestOrigin } from './csrf';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/app';

describe('parseCookieHeader', () => {
  it('parses multiple cookies and decodes values', () => {
    const cookies = parseCookieHeader('session=abc%2Fdef; theme=dark');
    expect(cookies.get('session')).toBe('abc/def');
    expect(cookies.get('theme')).toBe('dark');
  });

  it('keeps the first occurrence of a duplicated name', () => {
    expect(parseCookieHeader('session=first; session=second').get('session')).toBe('first');
  });

  it('ignores malformed parts', () => {
    const cookies = parseCookieHeader('=nothing; broken; ok=1; bad=%E0%A4%A');
    expect([...cookies.keys()]).toEqual(['ok']);
  });

  it('handles a missing header', () => {
    expect(parseCookieHeader(undefined).size).toBe(0);
  });
});

describe('session cookie configuration', () => {
  it('uses an HttpOnly, SameSite=Lax, host-only cookie in development', () => {
    const config = new AppConfig(parseEnv({ DATABASE_URL }));
    expect(config.auth.sessionCookieName).toBe('session');
    expect(sessionCookieOptions(config.auth, 1000)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000,
    });
  });

  it('uses a Secure __Host- cookie in production', () => {
    const config = new AppConfig(
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL,
        DATABASE_SSL_CA_PATH: '/ca.crt',
        APP_ORIGINS: 'https://app.example.com',
        MAIL_TRANSPORT: 'resend',
        RESEND_API_KEY: 're_key',
      }),
    );
    const options = sessionCookieOptions(config.auth, 1000);
    expect(config.auth.sessionCookieName).toBe('__Host-session');
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    expect(options).not.toHaveProperty('domain');
  });

  it('clears the cookie with matching attributes', () => {
    const config = new AppConfig(parseEnv({ DATABASE_URL }));
    expect(clearedSessionCookieOptions(config.auth)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
  });
});

describe('isTrustedRequestOrigin', () => {
  const allowed = ['https://app.example.com'];

  it.each(['GET', 'HEAD', 'OPTIONS'])('does not check safe method %s', (method) => {
    expect(isTrustedRequestOrigin(method, {}, allowed)).toBe(true);
  });

  it('accepts an allowed Origin', () => {
    expect(isTrustedRequestOrigin('POST', { origin: 'https://app.example.com' }, allowed)).toBe(
      true,
    );
  });

  it('falls back to the Referer origin', () => {
    expect(
      isTrustedRequestOrigin('POST', { referer: 'https://app.example.com/login?x=1' }, allowed),
    ).toBe(true);
  });

  it.each([
    [{}],
    [{ origin: 'https://evil.example.com' }],
    [{ origin: 'null' }],
    [{ origin: 'https://app.example.com.evil.com' }],
    [{ referer: 'not a url' }],
  ])('rejects untrusted or missing origin %j', (headers) => {
    expect(isTrustedRequestOrigin('DELETE', headers, allowed)).toBe(false);
  });
});
