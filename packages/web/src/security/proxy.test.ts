/** @vitest-environment node */
import { NextRequest } from 'next/server';
import { CSP_HEADER, withContentSecurityPolicy } from './proxy';

function nonceFrom(policy: string | null): string | undefined {
  return policy?.match(/'nonce-([^']+)'/)?.[1];
}

describe('withContentSecurityPolicy', () => {
  it('sets a nonce-based policy on the response and forwards it to rendering', () => {
    const response = withContentSecurityPolicy(new NextRequest('https://shop.example.pk/menu'));
    const policy = response.headers.get(CSP_HEADER);

    expect(nonceFrom(policy)).toBeDefined();
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonceFrom(policy));
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
  });

  it('issues a fresh nonce for every request', () => {
    const first = withContentSecurityPolicy(new NextRequest('https://shop.example.pk/'));
    const second = withContentSecurityPolicy(new NextRequest('https://shop.example.pk/'));
    expect(nonceFrom(first.headers.get(CSP_HEADER))).not.toBe(
      nonceFrom(second.headers.get(CSP_HEADER)),
    );
  });

  it('passes extra sources through to the policy', () => {
    const response = withContentSecurityPolicy(new NextRequest('https://shop.example.pk/'), {
      imgSources: ['https://cdn.example.pk'],
    });
    expect(response.headers.get(CSP_HEADER)).toContain('https://cdn.example.pk');
  });
});
