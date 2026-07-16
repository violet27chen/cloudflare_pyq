/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Public Worker/API base URL. Same origin in prod (Pages reverse proxy). */
  readonly PUBLIC_API_BASE?: string;
  /** Public Supabase URL (used by admin login only). */
  readonly PUBLIC_SUPABASE_URL?: string;
  /** Public Supabase anon key (safe to expose). */
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  /** Public author display name shown in the feed header. */
  readonly PUBLIC_AUTHOR_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
