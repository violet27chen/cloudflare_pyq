/**
 * API base URL. Same-origin in production (Pages proxies /api to Worker).
 * In local dev, points at the Worker port.
 */
export const API_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_API_BASE
    ? (import.meta.env.PUBLIC_API_BASE as string)
    : '';

export const AUTHOR_NAME =
  (typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_AUTHOR_NAME as string) ??
  'L.';

export const SUPABASE_URL =
  typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_SUPABASE_URL
    ? (import.meta.env.PUBLIC_SUPABASE_URL as string)
    : '';

export const SUPABASE_ANON_KEY =
  typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_SUPABASE_ANON_KEY
    ? (import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string)
    : '';
