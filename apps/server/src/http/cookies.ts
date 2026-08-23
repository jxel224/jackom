/**
 * Minimal cookie parse/serialize — this codebase uses Node's bare `http` module (no
 * Express/cookie-parser, matching http-api-server.ts's existing "dependency-free" design), so this
 * is the one small piece that pattern needs for the Permanent Business Backend's session cookie.
 */

export const SESSION_COOKIE_NAME = 'jackom_session';

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

export interface SessionCookieOptions {
  secure: boolean;
  maxAgeSeconds: number;
}

/** `SameSite=Lax` is sufficient here — the frontend and this API are same-SITE (share an eTLD+1) in every real deployment topology this project targets, even though they're different origins/ports; see PERMANENT_BACKEND_FOUNDATION_REPORT.md's Session Model section. */
export function serializeSessionCookie(rawToken: string, options: SessionCookieOptions): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${options.maxAgeSeconds}`,
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export function serializeExpiredSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
