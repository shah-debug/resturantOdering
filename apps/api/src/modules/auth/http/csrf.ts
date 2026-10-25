const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface OriginHeaders {
  origin?: string | undefined;
  referer?: string | undefined;
}

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isTrustedRequestOrigin(
  method: string,
  headers: OriginHeaders,
  allowedOrigins: readonly string[],
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) {
    return true;
  }
  const claimed = headers.origin ?? (headers.referer ? originOf(headers.referer) : null);
  if (!claimed || claimed === 'null') {
    return false;
  }
  return allowedOrigins.includes(claimed);
}
