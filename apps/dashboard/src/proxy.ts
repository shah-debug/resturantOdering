import type { NextRequest, NextResponse } from 'next/server';
import { withContentSecurityPolicy } from '@app/web/proxy';

export function proxy(request: NextRequest): NextResponse {
  return withContentSecurityPolicy(request);
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
