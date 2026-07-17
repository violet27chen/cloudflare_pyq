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

// Post images: conservative size + image-only.
const POST_MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const POST_ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const POST_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Background media: image OR video, larger budget (whole-page bg).
const BG_MAX_SIZE = 50 * 1024 * 1024; // 50 MB
const BG_ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
]);
const BG_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

upload.post('/', requireAuthor, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file || typeof file === 'string') {
    return fail(c, 400, ERR.BAD_REQUEST, 'A "file" field is required.');
  }

  // `kind` = 'bg' enables video + larger limit; default is post image.
  const kind = formData.get('kind') === 'bg' ? 'bg' : 'post';
  const allowed = kind === 'bg' ? BG_ALLOWED : POST_ALLOWED;
  const extMap = kind === 'bg' ? BG_EXT : POST_EXT;
  const maxSize = kind === 'bg' ? BG_MAX_SIZE : POST_MAX_SIZE;
  const prefix = kind === 'bg' ? 'bg' : 'post-images';

  if (!allowed.has(file.type)) {
    return fail(
      c,
      422,
      ERR.UNSUPPORTED_MEDIA,
      kind === 'bg'
        ? `不支持的背景类型: ${file.type}。请使用 jpeg/png/webp 图片或 mp4/webm 视频。`
        : `Unsupported image type: ${file.type}. Use jpeg, png, or webp.`,
    );
  }
  if (file.size > maxSize) {
    return fail(
      c,
      422,
      ERR.PAYLOAD_TOO_LARGE,
      `文件过大 (${(file.size / 1024 / 1024).toFixed(1)} MB)。上限 ${Math.round(
        maxSize / 1024 / 1024,
      )} MB。`,
    );
  }

  const ext = extMap[file.type] ?? 'bin';
  const key = `${prefix}/${crypto.randomUUID()}.${ext}`;

  await c.env.BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Same-origin public URL served by GET /img/:key.
  const url = `/img/${key}`;
  return ok(c, { url }, 201);
});

export default upload;
