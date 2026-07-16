import { Hono } from 'hono';
import type { AppType } from '../types';
import { createServiceClient } from '../utils/supabase';
import {
  verifySupabaseAccessToken,
  issueSessionToken,
} from '../utils/jwt';
import { ok, fail, ERR } from '../utils/response';

/**
 * Auth route.
 *
 * The author logs in via Supabase Auth from /admin (anon key only, safe to
 * expose). The browser gets a Supabase access_token, sends it here, and
 * receives a short-lived Moments session token that the Worker's
 * requireAuthor middleware accepts.
 *
 *   POST /session   { supabase_access_token }  -> { token, expires_in }
 */
export const auth = new Hono<AppType>();

const SESSION_TTL_SECONDS = 60 * 60 * 2; // must match jwt.ts

auth.post('/session', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 400, ERR.BAD_REQUEST, 'Request body must be JSON.');
  }
  const raw = (body as Record<string, unknown>)?.supabase_access_token;
  if (typeof raw !== 'string' || raw.length < 10) {
    return fail(c, 400, ERR.BAD_REQUEST, 'supabase_access_token is required.');
  }

  // Verify the Supabase JWT against JWKS.
  const userId = await verifySupabaseAccessToken(c.env, raw);
  if (!userId) {
    return fail(
      c,
      401,
      ERR.UNAUTHORIZED,
      'Supabase token is invalid or expired. Please sign in again.',
    );
  }

  // Optional: ensure the user is the single allowed author.
  // The Supabase project is single-user, but for defense-in-depth we check
  // that the user exists in auth.users via the service-role client.
  const supabase = createServiceClient(c.env);
  const { data: user, error: userErr } = await supabase.auth.admin.getUserById(
    userId,
  );
  if (userErr) throw userErr;
  if (!user || !user.user.email) {
    return fail(c, 403, ERR.FORBIDDEN, 'User not found in auth system.');
  }

  // Issue a Moments session token.
  const token = await issueSessionToken(c.env, userId);
  return ok(c, { token, expires_in: SESSION_TTL_SECONDS }, 201);
});

export default auth;
