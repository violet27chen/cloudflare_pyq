import type { ApiResponse, AppType } from '../types';
import type { Context } from 'hono';

type HonoContext = Context<AppType>;

/** Standard success envelope. */
export function ok<T>(c: HonoContext, data: T, status: 200 | 201 = 200) {
  const body: ApiResponse<T> = { ok: true, data };
  return c.json(body, status);
}

/** Standard error envelope with an HTTP status. */
export function fail(
  c: HonoContext,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500,
  code: string,
  message: string,
) {
  const body: ApiResponse<never> = {
    ok: false,
    error: { code, message },
  };
  return c.json(body, status);
}

/** Turn a thrown value into a safe message (never leak internals). */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Stable error codes used across the API. */
export const ERR = {
  BAD_REQUEST: 'bad_request',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  VALIDATION: 'validation',
  RATE_LIMITED: 'rate_limited',
  PAYLOAD_TOO_LARGE: 'payload_too_large',
  UNSUPPORTED_MEDIA: 'unsupported_media_type',
  INTERNAL: 'internal_error',
} as const;
