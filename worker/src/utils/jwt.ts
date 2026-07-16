import type { Env } from '../types';

/**
 * JWT (HS256) helpers for the author session.
 *
 * Flow:
 *   1. Author logs in via Supabase Auth from /admin (anon key only).
 *   2. Frontend sends the Supabase access_token to POST /api/auth/session.
 *   3. Worker verifies it against Supabase JWKS (or audience check) and,
 *      if the user is the configured author, issues a SHORT-LIVED
 *      Moments session token signed with ADMIN_JWT_SECRET.
 *   4. Frontend stores this token (memory + sessionStorage, not localStorage
 *      of visitor_id scope) and sends it as `Authorization: Bearer <token>`
 *      on all admin mutations.
 *
 * This indirection means the Worker never trusts a browser-supplied
 * "I am the author" claim without the Supabase JWT to back it.
 *
 * Uses Web Crypto (available in Workers), no external jwt lib.
 */

const SESSION_TTL_SECONDS = 60 * 60 * 2; // 2 hours

interface SessionClaims {
  sub: string; // supabase user id
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
  const payload = b64urlEncode(JSON.stringify(header)) +
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
  const [payload, sig] = [parts.slice(0, 2).join('.'), parts[2]];

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

/**
 * Verify a Supabase-issued access token using its JWKS.
 *
 * Supabase Auth signs JWTs with an RS256 key published at
 *   <SUPABASE_URL>/auth/v1/.well-known/jwks.json
 * We fetch + cache the key set (Workers cache via Cache API) and verify
 * the signature + expiry. On success returns the user id (sub).
 *
 * This is used by POST /api/auth/session to mint our own short token.
 */
export async function verifySupabaseAccessToken(
  env: Env,
  accessToken: string,
): Promise<string | null> {
  const parts = accessToken.split('.');
  if (parts.length !== 3) return null;

  // 1. decode header + claims (no trust yet)
  let header: { kid?: string; alg?: string };
  let claims: { sub?: string; exp?: number; aud?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;
  if (typeof claims.exp === 'number' && Date.now() / 1000 >= claims.exp) {
    return null;
  }
  if (typeof claims.sub !== 'string') return null;

  // 2. fetch JWKS (cached for 10 min)
  const jwksUrl = `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
  const cache = caches.default;
  let jwksRes = await cache.match(new Request(jwksUrl));
  if (!jwksRes) {
    jwksRes = await fetch(jwksUrl);
    if (jwksRes.ok) {
      const cached = new Response(jwksRes.body, jwksRes);
      cached.headers.set('Cache-Control', 'public, max-age=600');
      await cache.put(new Request(jwksUrl), cached.clone());
    }
  }
  if (!jwksRes || !jwksRes.ok) return null;
  const jwks = (await jwksRes.clone().json()) as {
    keys: { kid: string; n: string; e: string; kty: string }[];
  };
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  // 3. import RSA public key and verify signature
  const key = await crypto.subtle.importKey(
    'jwk',
    { ...jwk, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const sigBytes = b64urlDecode(parts[2]);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    sigBytes,
    data,
  );
  return ok ? claims.sub : null;
}
