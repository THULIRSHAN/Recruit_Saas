import type { CookieOptions } from 'express';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';

// httpOnly + Secure (prod only, since local/dev runs over plain http) +
// SameSite=Strict per docs/authentication.md §2 -- this is what actually
// keeps the refresh token out of reach of XSS-injected JS.
export function refreshCookieOptions(): CookieOptions {
  const ttlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7);
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/auth',
    maxAge: ttlDays * 24 * 60 * 60 * 1000,
  };
}
