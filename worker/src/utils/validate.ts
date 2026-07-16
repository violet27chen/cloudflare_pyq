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
const IMAGE_URL_RE = /^https?:\/\/[^\s"'<>]{1,1024}$/i;

export interface PostInput {
  content: string;
  image_urls: string[];
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

  const rawImages = Array.isArray(b.image_urls) ? b.image_urls : [];
  if (rawImages.length > MAX_IMAGES) {
    throw new ValidationError(`A post may have at most ${MAX_IMAGES} images.`);
  }
  const image_urls: string[] = [];
  for (const u of rawImages) {
    if (typeof u !== 'string' || !IMAGE_URL_RE.test(u)) {
      throw new ValidationError('One or more image URLs are invalid.');
    }
    image_urls.push(u);
  }

  return { content, image_urls };
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
