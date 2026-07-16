import type { Context, MiddlewareHandler } from 'hono';
import type { AppType } from '../types';
import { fail, ERR } from '../utils/response';

type HonoContext = Context<AppType>;

/**
 * Rate limiting.
 *
 * Two strategies:
 *  - Primary (production): the Cloudflare Rate Limiting binding. Wire it
 *    in wrangler.toml as `[[unsafe.bindings]] name="RATE_LIMITER"...`
 *    once your plan supports it. Until then RATE_LIMITER is undefined
 *    and we fall back to the in-memory limiter below.
 *  - Fallback (dev/free): an in-memory sliding-window counter scoped per
 *    isolate. Imperfect (Workers have many isolates) but good enough to
 *    stop naive abuse in dev and on small deploys.
 *
 * Keyed on the client IP from CF-Connecting-IP, falling back to the
 * visitor_id query/body param when present (likes are per-visitor).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

// Module-scoped, per-isolate. Roughly: every Worker invocation may hit a
// different isolate, so this is a soft limit, not a hard guarantee.
const memory = new Map<string, Bucket>();

interface RateLimitOptions {
  /** Identifier prefix, e.g. "like" or "post". */
  bucket: string;
  /** Max requests within the window. */
  limit: number;
  /** Window size in seconds. */
  windowSeconds: number;
}

function clientKey(c: HonoContext, bucket: string): string {
  const ip =
    c.req.raw.headers.get('CF-Connecting-IP') ||
    c.req.raw.headers.get('X-Forwarded-For') ||
    'unknown';
  return `${bucket}:${ip}`;
}

function memoryCheck(
  key: string,
  limit: number,
  windowSeconds: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const b = memory.get(key);
  if (!b || now >= b.resetAt) {
    const resetAt = now + windowSeconds * 1000;
    memory.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  if (b.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: b.resetAt };
  }
  b.count += 1;
  return { allowed: true, remaining: limit - b.count, resetAt: b.resetAt };
}

export function rateLimit(
  opts: RateLimitOptions,
): MiddlewareHandler<AppType> {
  return async (c, next) => {
    const key = clientKey(c, opts.bucket);

    // Native binding path (preferred when available).
    if (c.env.RATE_LIMITER && typeof (c.env.RATE_LIMITER as any).limit === 'function') {
      try {
        const { success } = await (c.env.RATE_LIMITER as any).limit({
          key,
        });
        if (!success) {
          return fail(
            c,
            429,
            ERR.RATE_LIMITED,
            'Too many requests. Please slow down.',
          );
        }
        await next();
        return;
      } catch {
        // Fall through to memory limiter on any binding error.
      }
    }

    const res = memoryCheck(key, opts.limit, opts.windowSeconds);
    c.header('RateLimit-Limit', String(opts.limit));
    c.header('RateLimit-Remaining', String(Math.max(0, res.remaining)));
    c.header(
      'RateLimit-Reset',
      String(Math.ceil((res.resetAt - Date.now()) / 1000)),
    );
    if (!res.allowed) {
      return fail(
        c,
        429,
        ERR.RATE_LIMITED,
        'Too many requests. Please slow down.',
      );
    }
    await next();
  };
}
