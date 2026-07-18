import type { PageCursor } from '../types';

/**
 * Input validation utilities.
 * Designed for fail-fast: throw on invalid input, the middleware turns
 * thrown ValidationErrors into 422 responses.
 */

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly code = 'validation',
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

const VISITOR_RE = /^visitor_[A-Za-z0-9_-]{6,48}$/;

/** 动态支持的媒体类型。 */
export const MEDIA_TYPES = ['image', 'gif', 'video', 'live'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export interface MediaInput {
  type: MediaType;
  url: string;
  poster_url?: string;
}

/** Validate a visitor_id, returning it trimmed, or throw. */
export function assertVisitorId(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ValidationError('visitor_id is required.');
  }
  const v = raw.trim();
  if (!VISITOR_RE.test(v)) {
    throw new ValidationError('visitor_id has an invalid format.');
  }
  return v;
}

const POST_MAX_LEN = 5000;
const POST_MIN_LEN = 1;
const MAX_IMAGES = 9;
const IMAGE_URL_RE = /^(?:https?:\/\/[^\s"'<>]{1,1024}|\/img\/[^\s"'<>]{1,1024})$/i;

export interface PostInput {
  content: string;
  /** 兼容旧客户端：仅图片 url 平铺数组（legacy，已不再由服务端写入）。 */
  image_urls?: string[];
  /** 带类型的媒体列表（始终存在，可能为空数组）。 */
  media: MediaInput[];
}

/** Validate a post body for create/edit. Returns normalized values. */
export function assertPostInput(body: unknown): PostInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be an object.');
  }
  const b = body as Record<string, unknown>;

  const content = typeof b.content === 'string' ? b.content.trim() : '';
  if (content.length < POST_MIN_LEN || content.length > POST_MAX_LEN) {
    throw new ValidationError(
      `Content must be between ${POST_MIN_LEN} and ${POST_MAX_LEN} characters.`,
    );
  }

  // 优先使用带类型的 media；否则退回旧的 image_urls。
  let media: MediaInput[];
  if (Array.isArray(b.media)) {
    if (b.media.length > MAX_IMAGES) {
      throw new ValidationError(`一条动态最多包含 ${MAX_IMAGES} 个媒体。`);
    }
    media = [];
    for (const raw of b.media) {
      if (!raw || typeof raw !== 'object') {
        throw new ValidationError('媒体项格式错误。');
      }
      const m = raw as Record<string, unknown>;
      const type = m.type;
      if (typeof type !== 'string' || !MEDIA_TYPES.includes(type as MediaType)) {
        throw new ValidationError('媒体类型非法（应为 image/gif/video/live）。');
      }
      const url = typeof m.url === 'string' ? m.url.trim() : '';
      if (!IMAGE_URL_RE.test(url)) {
        throw new ValidationError('媒体地址无效。');
      }
      const poster = typeof m.poster_url === 'string' ? m.poster_url.trim() : '';
      if (poster && !IMAGE_URL_RE.test(poster)) {
        throw new ValidationError('媒体封面地址无效。');
      }
      media.push({ type: type as MediaType, url, poster_url: poster || undefined });
    }
  } else if (Array.isArray(b.image_urls)) {
    if (b.image_urls.length > MAX_IMAGES) {
      throw new ValidationError(`一条动态最多包含 ${MAX_IMAGES} 个媒体。`);
    }
    media = [];
    for (const u of b.image_urls) {
      if (typeof u !== 'string' || !IMAGE_URL_RE.test(u)) {
        throw new ValidationError('One or more image URLs are invalid.');
      }
      media.push({ type: 'image', url: u });
    }
  } else {
    media = [];
  }

  return { content, image_urls: media.map((m) => m.url), media };
}

/* ---------------- profile (author info) ---------------- */

const PROFILE_NAME_MAX = 60;
const PROFILE_BIO_MAX = 280;

export interface ProfileInput {
  display_name: string;
  bio: string;
  avatar_url: string;
  cover_image_url: string;
}

/** Validate a profile body for PUT /api/profile. Returns normalized values. */
export function assertProfileInput(body: unknown): ProfileInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be an object.');
  }
  const b = body as Record<string, unknown>;

  const displayName =
    typeof b.display_name === 'string' ? b.display_name.trim() : '';
  if (displayName.length > PROFILE_NAME_MAX) {
    throw new ValidationError(
      `Display name must be at most ${PROFILE_NAME_MAX} characters.`,
    );
  }

  const bio = typeof b.bio === 'string' ? b.bio : '';
  if (bio.length > PROFILE_BIO_MAX) {
    throw new ValidationError(
      `Bio must be at most ${PROFILE_BIO_MAX} characters.`,
    );
  }

  const avatar =
    typeof b.avatar_url === 'string' ? b.avatar_url.trim() : '';
  if (avatar && !IMAGE_URL_RE.test(avatar)) {
    throw new ValidationError('Avatar URL is invalid.');
  }

  const cover =
    typeof b.cover_image_url === 'string' ? b.cover_image_url.trim() : '';
  if (cover && !IMAGE_URL_RE.test(cover)) {
    throw new ValidationError('Cover image URL is invalid.');
  }

  return {
    display_name: displayName || 'L.',
    bio,
    avatar_url: avatar,
    cover_image_url: cover,
  };
}

/* ---------------- site settings (interface background) ---------------- */

const SETTINGS_BG_RE =
  /^(?:https?:\/\/[^\s"'<>]{1,1024}|\/img\/[^\s"'<>]{1,1024})$/i;

/** Allowed theme color keys. */
export const THEME_COLOR_KEYS = [
  'bg',
  'card',
  'card_2',
  'line',
  'fg',
  'fg_soft',
  'fg_muted',
  'accent',
  'bio',
] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

/** Empty string (use default) or a #rgb / #rrggbb hex color. */
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Parse + normalize an arbitrary colors object into ThemeColors. */
export function parseThemeColors(raw: unknown): Record<ThemeColorKey, string> {
  const out = {} as Record<ThemeColorKey, string>;
  for (const key of THEME_COLOR_KEYS) out[key] = '';
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of THEME_COLOR_KEYS) {
      const v = obj[key];
      if (typeof v === 'string') {
        const t = v.trim();
        if (t === '' || HEX_COLOR_RE.test(t)) out[key] = t;
      }
    }
  }
  return out;
}

export interface SettingsInput {
  bg_type: 'none' | 'image' | 'video';
  bg_url: string;
  colors: Record<ThemeColorKey, string>;
}

/** Validate a settings body for PUT /api/settings. Returns normalized. */
export function assertSettingsInput(body: unknown): SettingsInput {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be an object.');
  }
  const b = body as Record<string, unknown>;

  const bgType =
    b.bg_type === 'image' || b.bg_type === 'video' ? b.bg_type : 'none';
  const bgUrl = typeof b.bg_url === 'string' ? b.bg_url.trim() : '';

  if (bgType !== 'none' && !SETTINGS_BG_RE.test(bgUrl)) {
    throw new ValidationError(
      '背景地址无效（需为图片/视频 URL，或以 /img/ 开头）。',
    );
  }

  const colors = parseThemeColors(b.colors);

  return {
    bg_type: bgType,
    bg_url: bgType === 'none' ? '' : bgUrl,
    colors,
  };
}

/** Parse a non-negative int query param with bounds. */
export function parseIntQuery(
  raw: string | undefined,
  opts: { default: number; min: number; max: number },
): number {
  if (raw === undefined || raw === '') return opts.default;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < opts.min) return opts.min;
  if (n > opts.max) return opts.max;
  return n;
}

/* ---------------- cursor (keyset pagination) ---------------- */

function b64urlEncodeStr(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecodeStr(s: string): string {
  return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
}

/** Encode a cursor from (timestamp, id) - opaque to clients. */
export function encodeCursor(ts: string, id: string): string {
  const payload: PageCursor = { ts, id };
  return b64urlEncodeStr(JSON.stringify(payload));
}

/** Decode a client-supplied cursor, or return null if malformed. */
export function decodeCursor(raw: string | undefined): PageCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecodeStr(raw)) as Partial<PageCursor>;
    if (
      typeof parsed.ts !== 'string' ||
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(parsed.id)
    ) {
      return null;
    }
    const ts = Date.parse(parsed.ts);
    if (Number.isNaN(ts)) return null;
    return { ts: parsed.ts, id: parsed.id };
  } catch {
    return null;
  }
}
