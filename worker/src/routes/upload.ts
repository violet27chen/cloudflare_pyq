import { Hono } from 'hono';
import type { AppType } from '../types';
import { ok, fail, ERR } from '../utils/response';
import { requireAuthor } from '../middleware/auth';

/**
 * Media upload route.
 *   POST /   multipart/form-data, field "file"  -> { url, media_type }
 *
 * Stores the file in the R2 bucket (binding BUCKET) and returns a
 * same-origin public URL served by the Worker's /img route. No Supabase.
 *
 * `kind`:
 *   - 'post' (default): 动态媒体 —— 图片 / 动图(gif) / 视频(mp4,webm,mov)
 *   - 'bg':            整站背景 —— 图片 或 视频，预算更大
 */
export const upload = new Hono<AppType>();

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime', // .mov（实况 / Live Photo 常用）
]);

// 单文件大小上限
const POST_IMG_MAX_SIZE = 8 * 1024 * 1024; // 图片 / 动图 8 MB
const POST_VIDEO_MAX_SIZE = 30 * 1024 * 1024; // 视频 30 MB
const BG_MAX_SIZE = 50 * 1024 * 1024; // 背景 50 MB

const POST_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

function detectMediaType(fileType: string): 'image' | 'gif' | 'video' {
  if (fileType === 'image/gif') return 'gif';
  if (fileType.startsWith('video/')) return 'video';
  return 'image';
}

function sizeLabel(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

upload.post('/', requireAuthor, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file || typeof file === 'string') {
    return fail(c, 400, ERR.BAD_REQUEST, 'A "file" field is required.');
  }

  const kind = formData.get('kind') === 'bg' ? 'bg' : 'post';
  const isVideo = file.type.startsWith('video/');

  if (kind === 'bg') {
    const allowed = new Set([...IMAGE_TYPES, ...VIDEO_TYPES]);
    if (!allowed.has(file.type)) {
      return fail(
        c,
        422,
        ERR.UNSUPPORTED_MEDIA,
        `不支持的背景类型: ${file.type}。请使用 jpeg/png/webp 图片或 mp4/webm 视频。`,
      );
    }
    if (file.size > BG_MAX_SIZE) {
      return fail(
        c,
        422,
        ERR.PAYLOAD_TOO_LARGE,
        `文件过大 (${sizeLabel(file.size)})。背景上限 ${Math.round(
          BG_MAX_SIZE / 1024 / 1024,
        )} MB。`,
      );
    }
    const ext = POST_EXT[file.type] ?? 'bin';
    const key = `bg/${crypto.randomUUID()}.${ext}`;
    await c.env.BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
    return ok(c, { url: `/img/${key}`, media_type: detectMediaType(file.type) }, 201);
  }

  // 动态媒体
  if (!IMAGE_TYPES.has(file.type) && !VIDEO_TYPES.has(file.type)) {
    return fail(
      c,
      422,
      ERR.UNSUPPORTED_MEDIA,
      `不支持的媒体类型: ${file.type}。动态支持 jpeg/png/webp 图片、gif 动图、mp4/webm/mov 视频。`,
    );
  }
  const maxSize = isVideo ? POST_VIDEO_MAX_SIZE : POST_IMG_MAX_SIZE;
  if (file.size > maxSize) {
    return fail(
      c,
      422,
      ERR.PAYLOAD_TOO_LARGE,
      `文件过大 (${sizeLabel(file.size)})。动态${isVideo ? '视频' : '图片/动图'}上限 ${Math.round(
        maxSize / 1024 / 1024,
      )} MB。`,
    );
  }

  const ext = POST_EXT[file.type] ?? 'bin';
  const key = `post-images/${crypto.randomUUID()}.${ext}`;
  await c.env.BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  return ok(
    c,
    { url: `/img/${key}`, media_type: detectMediaType(file.type) },
    201,
  );
});

export default upload;
