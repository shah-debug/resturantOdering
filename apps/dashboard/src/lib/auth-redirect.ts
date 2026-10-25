export const SESSION_COOKIE_NAMES = ['__Host-session', 'session'] as const;

export const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/accept-invitation',
] as const;

export interface CookieReader {
  has(name: string): boolean;
}

export function hasSessionCookie(cookies: CookieReader): boolean {
  return SESSION_COOKIE_NAMES.some((name) => cookies.has(name));
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function buildLoginPath(next: string): string {
  return next === '/' || next === '' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
}

export function getLoginRedirect({
  pathname,
  search,
  hasSession,
}: {
  pathname: string;
  search: string;
  hasSession: boolean;
}): string | null {
  if (hasSession || isPublicPath(pathname)) {
    return null;
  }
  return buildLoginPath(`${pathname}${search}`);
}
