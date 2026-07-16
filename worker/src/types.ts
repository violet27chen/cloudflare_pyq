/**
 * Cloudflare Worker bindings & shared domain types for Moments.
 */

export interface Env {
  ENVIRONMENT: 'development' | 'production';

  /** Supabase project URL, e.g. https://xxxx.supabase.co */
  SUPABASE_URL: string;
  /** Service role key - server only, NEVER exposed to the browser. */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Secret used to sign short-lived author session tokens. */
  ADMIN_JWT_SECRET: string;
  /** Supabase Storage bucket for post images. */
  STORAGE_BUCKET: string;

  // Optional: Cloudflare Rate Limiting binding (requires a paid plan / beta).
  // Declared here so the route layer can reference it once it is wired.
  RATE_LIMITER?: unknown;
}

export interface LikeRow {
  id: string;
  post_id: string;
  visitor_id: string;
  created_at: string;
}

export interface PostImageRow {
  id: string;
  post_id: string;
  url: string;
  position: number;
  created_at: string;
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
  images: string[];
  created_at: string;
  updated_at: string;
  like_count: number;
  liked: boolean;
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
  /** Author Supabase user id, set by requireAuthor middleware. */
  authorId: string;
}

/** Shared Hono app type (bindings + variables). */
export type AppType = { Bindings: Env; Variables: AppVariables };
