import { type NextRequest, NextResponse } from 'next/server';
import { buildContentSecurityPolicy, type ContentSecurityPolicyOptions, createNonce } from './csp';

export const NONCE_HEADER = 'x-nonce';
export const CSP_HEADER = 'Content-Security-Policy';

export type CspProxyOptions = Omit<ContentSecurityPolicyOptions, 'nonce' | 'isDevelopment'>;

export function withContentSecurityPolicy(
  request: NextRequest,
  options: CspProxyOptions = {},
): NextResponse {
  const nonce = createNonce();
  const policy = buildContentSecurityPolicy({
    ...options,
    nonce,
    isDevelopment: process.env.NODE_ENV === 'development',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(CSP_HEADER, policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CSP_HEADER, policy);
  return response;
}
