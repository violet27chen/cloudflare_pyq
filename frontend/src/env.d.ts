/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Public Worker/API base URL. Empty = same origin (Worker serves /api). */
  readonly PUBLIC_API_BASE?: string;
  /** Public author display name shown in the feed header. */
  readonly PUBLIC_AUTHOR_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
