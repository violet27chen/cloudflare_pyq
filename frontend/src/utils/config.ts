/**
 * API base URL. With the Worker serving the frontend, the API is
 * same-origin, so this is empty — paths like '/api/posts' resolve against
 * the current origin. Set PUBLIC_API_BASE only to override (e.g. local dev
 * pointing at a separate Worker).
 */
export const API_BASE: string =
  (import.meta.env.PUBLIC_API_BASE as string | undefined) ?? '';

export const AUTHOR_NAME: string =
  (import.meta.env.PUBLIC_AUTHOR_NAME as string | undefined) ?? 'L.';
