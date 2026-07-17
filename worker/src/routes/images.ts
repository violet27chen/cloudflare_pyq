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
  const rangeHeader = c.req.header('Range');

  // Parse a simple `bytes=START-END` (or `START-` / `-SUFFIX`) request.
  let rangeOpt: { offset: number; length?: number } | { suffix: number } | undefined;
  if (rangeHeader && /^bytes=(\d*)-(\d*)$/.test(rangeHeader)) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)!;
    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? parseInt(m[2], 10) : 0;
    if (m[1] && m[2]) rangeOpt = { offset: start, length: end - start + 1 };
    else if (m[1]) rangeOpt = { offset: start };
    else rangeOpt = { suffix: end || 0 };
  }

  const obj = await c.env.BUCKET.get(
    key,
    rangeOpt ? { range: rangeOpt } : undefined,
  );
  if (!obj) return fail(c, 404, ERR.NOT_FOUND, 'Image not found.');

  const headers = new Headers();
  headers.set(
    'Content-Type',
    obj.httpMetadata?.contentType ?? 'application/octet-stream',
  );
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Accept-Ranges', 'bytes');

  const total = obj.size;
  if (rangeHeader && obj.range) {
    const r = obj.range;
    let start = 0;
    let end = total - 1;
    if ('suffix' in r) {
      start = Math.max(0, total - r.suffix);
    } else if (r.offset !== undefined && r.length !== undefined) {
      start = r.offset;
      end = r.offset + r.length - 1;
    } else if (r.offset !== undefined) {
      start = r.offset;
    } else if (r.length !== undefined) {
      start = Math.max(0, total - r.length);
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
    return new Response(obj.body, { status: 206, headers });
  }
  return new Response(obj.body, { headers });
});

export default images;
