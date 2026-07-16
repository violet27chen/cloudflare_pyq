import type { MiddlewareHandler } from 'hono';
import type { AppType } from '../types';
import { verifySessionToken } from '../utils/jwt';
import { fail, ERR } from '../utils/response';

/**
 * Author-only guard.
 *
 * Reads `Authorization: Bearer <token>`, verifies the Moments session
 * token (signed with ADMIN_JWT_SECRET), and stashes the author user id
 * on the context var (`c.set('authorId', sub)`). Any failure -> 401.
 *
 * Apply ONLY to mutation routes (create / edit / delete / upload / stats).
 * Public read and like endpoints do not use this.
 */
export const requireAuthor: MiddlewareHandler<AppType> = async (c, next) => {
  const auth = c.req.header('Authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) {
    return fail(c, 401, ERR.UNAUTHORIZED, 'Authentication required.');
  }
  const sub = await verifySessionToken(c.env, m[1]);
  if (!sub) {
    return fail(
      c,
      401,
      ERR.UNAUTHORIZED,
      'Session expired or invalid. Please sign in again.',
    );
  }
  c.set('authorId', sub);
  await next();
};
