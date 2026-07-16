import type { MiddlewareHandler } from 'hono';
import type { AppType } from '../types';

/**
 * CORS for the public API.
 *
 * The feed and like endpoints are called from the browser, so we allow
 * the deployed origin (and localhost for dev). Authenticated mutation
 * endpoints also need CORS since /admin is a same-origin SPA but may be
 * previewed against a different port in dev.
 */
export const cors: MiddlewareHandler<AppType> = async (c, next) => {
  const origin = c.req.header('Origin');
  // Allow any same-origin request (no Origin header) plus explicit origins.
  const allowed = origin
    ? [origin]
    : ['*'];

  c.header('Access-Control-Allow-Origin', allowed[0] ?? '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  c.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Turnstile-Token',
  );
  c.header('Access-Control-Max-Age', '86400');
  c.header('Access-Control-Allow-Credentials', 'true');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }
  await next();
};
