import type { CookieOptions } from 'express';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';

// Scoped to /auth: only /auth/refresh and /auth/logout need to read this
// cookie, so there's no reason to send it on every request.
export const REFRESH_TOKEN_COOKIE_PATH = '/auth';

// httpOnly + Secure (prod only, since local/dev runs over plain http) +
// SameSite=Strict per docs/authentication.md §2 -- this is what actually
// keeps the refresh token out of reach of XSS-injected JS.
export function refreshCookieOptions(): CookieOptions {
  const ttlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7);
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: ttlDays * 24 * 60 * 60 * 1000,
  };
}
