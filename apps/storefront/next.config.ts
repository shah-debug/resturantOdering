import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import { z } from 'zod';

const DEV_API_ORIGIN = 'http://localhost:4000';

function resolveApiOrigin(phase: string): string {
  const schema = phase === PHASE_DEVELOPMENT_SERVER ? z.url().default(DEV_API_ORIGIN) : z.url();
  const result = schema.safeParse(process.env.API_ORIGIN);
  if (!result.success) {
    throw new Error(`API_ORIGIN must be set to a valid URL: ${z.prettifyError(result.error)}`);
  }
  return result.data.replace(/\/$/, '');
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];

function createNextConfig(phase: string): NextConfig {
  return {
    poweredByHeader: false,
    transpilePackages: ['@app/web'],
    reactStrictMode: true,
    rewrites: () =>
      Promise.resolve([
        { source: '/api/:path*', destination: `${resolveApiOrigin(phase)}/api/:path*` },
      ]),
    headers: () => Promise.resolve([{ source: '/:path*', headers: securityHeaders }]),
  };
}

export default createNextConfig;
