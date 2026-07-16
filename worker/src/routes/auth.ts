import { Hono } from 'hono';
import type { AppType } from '../types';
import { issueSessionToken } from '../utils/jwt';
import { ok, fail, ERR } from '../utils/response';

/**
 * Auth route.
 *
 * The author logs in with the ADMIN_PASSWORD from /admin, and the browser
 * exchanges it here for a short-lived Moments session token (signed with
 * ADMIN_JWT_SECRET) used on all mutations.
 *
 *   POST /session   { password }  -> { token, expires_in }
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
  const raw = (body as Record<string, unknown>)?.password;
  if (typeof raw !== 'string' || raw.length === 0) {
    return fail(c, 400, ERR.BAD_REQUEST, 'password is required.');
  }
  if (raw !== c.env.ADMIN_PASSWORD) {
    return fail(c, 401, ERR.UNAUTHORIZED, 'Incorrect password.');
  }

  const token = await issueSessionToken(c.env, 'author');
  return ok(c, { token, expires_in: SESSION_TTL_SECONDS }, 201);
});

export default auth;
