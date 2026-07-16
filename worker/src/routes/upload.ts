import { Hono } from 'hono';
import type { AppType } from '../types';
import { ok, fail, ERR } from '../utils/response';
import { requireAuthor } from '../middleware/auth';

/**
 * Image upload route.
 *
 *   POST /   multipart/form-data, field "file"
 *            -> { url }
 *
 * Accepts jpeg, png, webp up to 8 MB. Validates in the Worker before
 * uploading to Supabase Storage. The bucket (c.env.STORAGE_BUCKET) must
 * exist and have public read / service-role write policies (see schema.sql).
 *
 * Uploaded files are named: <post-image-prefix>/<uuid>.<ext>
 */
export const upload = new Hono<AppType>();

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
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

  // Type check.
  if (!ALLOWED_TYPES.has(file.type)) {
    return fail(
      c,
      422,
      ERR.UNSUPPORTED_MEDIA,
      `Unsupported image type: ${file.type}. Use jpeg, png, or webp.`,
    );
  }

  // Size check.
  if (file.size > MAX_SIZE) {
    return fail(
      c,
      422,
      ERR.PAYLOAD_TOO_LARGE,
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`,
    );
  }

  const ext = EXT_MAP[file.type] ?? 'jpg';
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `post-images/${filename}`;
  const bucket = c.env.STORAGE_BUCKET;

  // Upload to Supabase Storage using the REST API (service role auth).
  // Workers have no native Supabase Storage SDK; we use fetch directly
  // with the service-role key which bypasses Storage RLS.
  const uploadUrl = `${c.env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': file.type,
      'x-upsert': 'false',
    },
    body: file.stream(),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('[moments] storage upload failed:', detail);
    return fail(
      c,
      500,
      ERR.INTERNAL,
      'Image upload failed. Please try again.',
    );
  }

  // The public URL (bucket is public-read, so no token needed).
  const publicUrl = `${c.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

  return ok(c, { url: publicUrl }, 201);
});

export default upload;
