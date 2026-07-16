import type { Env } from '../types';

/**
 * JWT (HS256) helpers for the author session.
 *
 * Flow:
 *   1. Author submits the ADMIN_PASSWORD from /admin.
 *   2. Frontend posts it to POST /api/auth/session.
 *   3. Worker compares it to env.ADMIN_PASSWORD, and if correct issues a
 *      SHORT-LIVED Moments session token signed with ADMIN_JWT_SECRET.
 *   4. Frontend stores this token (sessionStorage) and sends it as
 *      `Authorization: Bearer <token>` on all admin mutations.
 *
 * Uses Web Crypto (available in Workers), no external jwt lib.
 */

const SESSION_TTL_SECONDS = 60 * 60 * 2; // 2 hours

interface SessionClaims {
  sub: string; // author id (constant 'author')
  role: 'author';
  iat: number;
  exp: number;
}

function b64urlEncode(input: Uint8Array | string): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** Sign and return a short-lived author session token. */
export async function issueSessionToken(
  env: Env,
  userId: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = {
    sub: userId,
    role: 'author',
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload =
    b64urlEncode(JSON.stringify(header)) +
    '.' +
    b64urlEncode(JSON.stringify(claims));

  const key = await hmacKey(env.ADMIN_JWT_SECRET);
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  );
  return payload + '.' + b64urlEncode(new Uint8Array(sig));
}

/**
 * Verify a token. Returns the user id on success, or null on any failure
 * (bad format, wrong signature, expired). Never throws for auth failures.
 */
export async function verifySessionToken(
  env: Env,
  token: string,
): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts.slice(0, 2).join('.');
  const sig = parts[2];

  const key = await hmacKey(env.ADMIN_JWT_SECRET);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    b64urlDecode(sig),
    new TextEncoder().encode(payload),
  );
  if (!valid) return null;

  let claims: SessionClaims;
  try {
    claims = JSON.parse(
      new TextDecoder().decode(b64urlDecode(parts[1])),
    ) as SessionClaims;
  } catch {
    return null;
  }
  if (claims.role !== 'author') return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || now >= claims.exp) return null;
  return claims.sub;
}
