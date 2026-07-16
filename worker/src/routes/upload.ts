import { Hono } from 'hono';
import type { AppType } from '../types';
import { ok, fail, ERR } from '../utils/response';
import { requireAuthor } from '../middleware/auth';

/**
 * Image upload route.
 *   POST /   multipart/form-data, field "file"  -> { url }
 *
 * Stores the file in the R2 bucket (binding BUCKET) and returns a
 * same-origin public URL served by the Worker's /img route. No Supabase.
 */
export const upload = new Hono<AppType>();

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

upload.post('/', requireAuthor, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file || typeof file === 'string') {
    return fail(c, 400, ERR.BAD_REQUEST, 'A "file" field is required.');
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return fail(
      c,
      422,
      ERR.UNSUPPORTED_MEDIA,
      `Unsupported image type: ${file.type}. Use jpeg, png, or webp.`,
    );
  }
  if (file.size > MAX_SIZE) {
    return fail(
      c,
      422,
      ERR.PAYLOAD_TOO_LARGE,
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`,
    );
  }

  const ext = EXT_MAP[file.type] ?? 'jpg';
  const key = `post-images/${crypto.randomUUID()}.${ext}`;

  await c.env.BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Same-origin public URL served by GET /img/:key.
  const url = `/img/${key}`;
  return ok(c, { url }, 201);
});

export default upload;
