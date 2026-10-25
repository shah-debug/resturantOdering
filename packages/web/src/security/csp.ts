export interface ContentSecurityPolicyOptions {
  nonce: string;
  isDevelopment: boolean;
  imgSources?: readonly string[];
  connectSources?: readonly string[];
}

export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
  imgSources = [],
  connectSources = [],
}: ContentSecurityPolicyOptions): string {
  const directives: Record<string, readonly string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", `'nonce-${nonce}'`],
    'img-src': ["'self'", 'blob:', 'data:', ...imgSources],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...connectSources],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };

  const policy = Object.entries(directives).map(
    ([directive, sources]) => `${directive} ${sources.join(' ')}`,
  );
  if (!isDevelopment) {
    policy.push('upgrade-insecure-requests');
  }
  return policy.join('; ');
}
