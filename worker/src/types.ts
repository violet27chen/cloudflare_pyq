/**
 * Cloudflare Worker bindings & shared domain types for Moments.
 *
 * Data lives in D1 (SQLite); images in R2; the built frontend is served
 * through the ASSETS binding. No Supabase anywhere.
 */

export interface Env {
  ENVIRONMENT: 'development' | 'production';

  /** Secret used to sign short-lived author session tokens. */
  ADMIN_JWT_SECRET: string;
  /** Password for the single author to obtain a session token. */
  ADMIN_PASSWORD: string;

  /** D1 database (SQLite) holding posts / post_images / likes. */
  DB: D1Database;
  /** R2 bucket for post images (served same-origin via /img). */
  BUCKET: R2Bucket;
  /** Static assets binding serving the built frontend (frontend/dist). */
  ASSETS: Fetcher;

  /**
   * Optional Cloudflare Rate Limiting binding. When absent (dev / free
   * plan), the rate-limit middleware falls back to an in-memory limiter.
   */
  RATE_LIMITER?: unknown;
}

export interface LikeRow {
  id: string;
  post_id: string;
  visitor_id: string;
  created_at: string;
}

/** 单条媒体：图片 / 动图 / 视频 / 实况（Live Photo）。 */
export type MediaType = 'image' | 'gif' | 'video' | 'live';

export interface MediaItem {
  type: MediaType;
  /** 主资源地址（图片 / 动图 / 视频 的 /img/... 或 http(s) 地址）。 */
  url: string;
  /** 视频 / 实况 的静态封面（/img/... 或 http(s) 地址）。可选。 */
  poster_url?: string;
}

export interface PostImageRow {
  id: string;
  post_id: string;
  url: string;
  position: number;
  created_at: string;
  media_type: MediaType;
  poster_url: string;
}

export interface PostRow {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  post_images?: PostImageRow[];
}

/** Shape returned by the read API to the browser. */
export interface PostDTO {
  id: string;
  content: string;
  /** 兼容旧客户端：所有媒体的主 url 平铺数组。 */
  images: string[];
  /** 新客户端使用的带类型的媒体列表。 */
  media: MediaItem[];
  created_at: string;
  updated_at: string;
  like_count: number;
  liked: boolean;
}

/** Author profile (editable from /admin). */
export interface ProfileDTO {
  display_name: string;
  bio: string;
  avatar_url: string;
  cover_image_url: string;
}

/** Themable color tokens. Empty string means "use default CSS variable". */
export interface ThemeColors {
  bg: string; // 页面背景
  card: string; // 卡片背景
  card_2: string; // 次级表面（输入框/骨架）
  line: string; // 边框 / 分割线
  fg: string; // 主文本
  fg_soft: string; // 正文文本
  fg_muted: string; // 次要文本（时间/弱文字）
  accent: string; // 强调色（链接/按钮）
  bio: string; // 个性签名
}

/** Site-wide interface background (whole-page image or video) + theme colors. */
export interface SiteSettingsDTO {
  bg_type: 'none' | 'image' | 'video';
  bg_url: string;
  colors: ThemeColors;
}

export interface ProfileRow {
  id: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  cover_image_url: string;
  updated_at: string;
}

/** Unified API response envelope. */
export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export interface ListResult<T> {
  items: T[];
  /** Cursor for the next page, or null when exhausted. */
  next_cursor: string | null;
}

/** Cursor payload (opaque to client; encoded base64url of ISO timestamp + id). */
export interface PageCursor {
  ts: string;
  id: string;
}

/** Hono context variables shared across the app. */
export interface AppVariables {
  /** Author id, set by requireAuthor middleware (constant 'author'). */
  authorId: string;
}

/** Shared Hono app type (bindings + variables). */
export type AppType = { Bindings: Env; Variables: AppVariables };
