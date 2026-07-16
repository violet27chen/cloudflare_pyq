import { Hono } from 'hono';
import type { AppType } from '../types';
import { fail, ERR } from '../utils/response';

/**
 * Serve R2 objects same-origin.
 *   GET /img/<key>   -> raw image bytes (public, long-cache)
 *
 * Keeps all assets under our own origin (no public R2 bucket / CORS).
 */
export const images = new Hono<AppType>();

images.get('/:key{.+}', async (c) => {
  const key = c.req.param('key');
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return fail(c, 404, ERR.NOT_FOUND, 'Image not found.');

  const headers = new Headers();
  headers.set(
    'Content-Type',
    obj.httpMetadata?.contentType ?? 'application/octet-stream',
  );
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers });
});

export default images;
