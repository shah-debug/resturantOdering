import { type NextRequest, NextResponse } from 'next/server';
import { withContentSecurityPolicy } from '@app/web/proxy';
import { getLoginRedirect, hasSessionCookie } from '@/lib/auth-redirect';

export function proxy(request: NextRequest): NextResponse {
  const loginRedirect = getLoginRedirect({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    hasSession: hasSessionCookie(request.cookies),
  });
  if (loginRedirect) {
    return NextResponse.redirect(new URL(loginRedirect, request.url));
  }
  return withContentSecurityPolicy(request, { imgSources: ['https:'] });
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
