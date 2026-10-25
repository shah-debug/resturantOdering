/** @vitest-environment node */
import { NextRequest } from 'next/server';
import { CSP_HEADER } from '@app/web/proxy';
import { getLoginRedirect, hasSessionCookie, isPublicPath } from '@/lib/auth-redirect';
import { safeNextPath } from '@/lib/form';
import { proxy } from './proxy';

describe('getLoginRedirect', () => {
  it('sends anonymous visitors of authenticated routes to login with the return path', () => {
    expect(
      getLoginRedirect({
        pathname: '/organizations/abc/members',
        search: '?page=2',
        hasSession: false,
      }),
    ).toBe('/login?next=%2Forganizations%2Fabc%2Fmembers%3Fpage%3D2');
    expect(getLoginRedirect({ pathname: '/', search: '', hasSession: false })).toBe('/login');
  });

  it('lets requests with a session cookie through', () => {
    expect(getLoginRedirect({ pathname: '/', search: '', hasSession: true })).toBeNull();
  });

  it('keeps auth pages reachable without a session', () => {
    for (const pathname of [
      '/login',
      '/signup',
      '/verify-email',
      '/forgot-password',
      '/reset-password',
      '/accept-invitation',
    ]) {
      expect(isPublicPath(pathname)).toBe(true);
      expect(getLoginRedirect({ pathname, search: '?token=x', hasSession: false })).toBeNull();
    }
    expect(isPublicPath('/login-history')).toBe(false);
  });

  it('accepts either the production or development cookie name', () => {
    expect(hasSessionCookie(new Set(['__Host-session']))).toBe(true);
    expect(hasSessionCookie(new Set(['session']))).toBe(true);
    expect(hasSessionCookie(new Set(['other']))).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('only allows same-origin relative paths', () => {
    expect(safeNextPath('/organizations/1/members')).toBe('/organizations/1/members');
    expect(safeNextPath('//evil.example.com')).toBe('/');
    expect(safeNextPath('/\\evil.example.com')).toBe('/');
    expect(safeNextPath('https://evil.example.com')).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
  });

  it.each(['/\t/evil.example.com', '/\n/evil.example.com', '/ /evil.example.com', '/foo\\bar'])(
    'rejects %j, which browsers could turn into another origin',
    (next) => {
      expect(safeNextPath(next)).toBe('/');
    },
  );
});

describe('proxy', () => {
  it('redirects anonymous requests for authenticated routes', () => {
    const response = proxy(new NextRequest('https://dash.example.pk/account/password'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://dash.example.pk/login?next=%2Faccount%2Fpassword',
    );
  });

  it('applies the content security policy when the request may proceed', () => {
    const signedIn = proxy(
      new NextRequest('https://dash.example.pk/', { headers: { cookie: 'session=abc' } }),
    );
    expect(signedIn.headers.get('location')).toBeNull();
    expect(signedIn.headers.get(CSP_HEADER)).toContain('nonce-');

    const authPage = proxy(new NextRequest('https://dash.example.pk/login'));
    expect(authPage.headers.get(CSP_HEADER)).toContain('nonce-');
  });
});
