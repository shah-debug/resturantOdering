import { buildContentSecurityPolicy, createNonce } from './csp';

function directive(policy: string, name: string): string | undefined {
  return policy.split('; ').find((entry) => entry.startsWith(`${name} `) || entry === name);
}

describe('createNonce', () => {
  it('produces unique base64 values with 128 bits of entropy', () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    }
  });
});

describe('buildContentSecurityPolicy', () => {
  const nonce = 'abc123';

  it('allows scripts only via nonce and strict-dynamic in production', () => {
    const policy = buildContentSecurityPolicy({ nonce, isDevelopment: false });
    expect(directive(policy, 'script-src')).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic'",
    );
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toContain('unsafe-inline');
  });

  it('adds unsafe-eval only in development', () => {
    const policy = buildContentSecurityPolicy({ nonce, isDevelopment: true });
    expect(directive(policy, 'script-src')).toContain("'unsafe-eval'");
  });

  it('blocks framing, plugins and foreign form targets', () => {
    const policy = buildContentSecurityPolicy({ nonce, isDevelopment: false });
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(policy, 'object-src')).toBe("object-src 'none'");
    expect(directive(policy, 'form-action')).toBe("form-action 'self'");
    expect(directive(policy, 'base-uri')).toBe("base-uri 'self'");
  });

  it('upgrades insecure requests only outside development', () => {
    expect(buildContentSecurityPolicy({ nonce, isDevelopment: false })).toContain(
      'upgrade-insecure-requests',
    );
    expect(buildContentSecurityPolicy({ nonce, isDevelopment: true })).not.toContain(
      'upgrade-insecure-requests',
    );
  });

  it('appends extra image and connect sources', () => {
    const policy = buildContentSecurityPolicy({
      nonce,
      isDevelopment: false,
      imgSources: ['https://images.example.com'],
      connectSources: ['https://realtime.example.com'],
    });
    expect(directive(policy, 'img-src')).toBe(
      "img-src 'self' blob: data: https://images.example.com",
    );
    expect(directive(policy, 'connect-src')).toBe(
      "connect-src 'self' https://realtime.example.com",
    );
  });
});
