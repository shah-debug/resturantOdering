import type { CookieOptions } from 'express';
import type { AuthConfig } from '../../../config/app-config.js';

export function parseCookieHeader(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) {
    return cookies;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    if (!name || cookies.has(name)) {
      continue;
    }
    try {
      cookies.set(name, decodeURIComponent(rawValue));
    } catch {
      continue;
    }
  }
  return cookies;
}

export function sessionCookieOptions(auth: AuthConfig, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: auth.secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function clearedSessionCookieOptions(auth: AuthConfig): CookieOptions {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions(auth, 0);
  return options;
}
