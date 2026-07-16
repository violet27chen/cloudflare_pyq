import { Hono } from 'hono';
import type { AppType, PostDTO, PostRow, PostImageRow, ListResult } from '../types';
import { createServiceClient } from '../utils/supabase';
import { ok, fail, ERR } from '../utils/response';
import {
  decodeCursor,
  encodeCursor,
  parseIntQuery,
  assertVisitorId,
  assertPostInput,
} from '../utils/validate';
import { rateLimit } from '../middleware/rateLimit';
import { requireAuthor } from '../middleware/auth';

/**
 * Posts routes.
 *
 *   GET    /                  list (cursor pagination)
 *   GET    /:id               single post
 *   POST   /                  create            [author]   (stage 6)
 *   PATCH  /:id               edit              [author]   (stage 6)
 *   DELETE /:id               delete            [author]   (stage 6)
 *   POST   /:id/like          like              [visitor]  (stage 5)
 *   DELETE /:id/like          unlike            [visitor]  (stage 5)
 */
export const posts = new Hono<AppType>();

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

/**
 * GET /api/posts
 *
 * Query params:
 *   cursor  optional, opaque value from a previous response
 *   limit   optional, default 10, max 30
 *   visitor optional, visitor_id to compute `liked` per post
 *
 * Returns newest-first. Uses keyset pagination on (created_at, id) for
 * stable ordering even when multiple posts share a timestamp.
 */
posts.get('/', async (c) => {
  const limit = parseIntQuery(c.req.query('limit'), {
    default: DEFAULT_LIMIT,
    min: 1,
    max: MAX_LIMIT,
  });
  const cursor = decodeCursor(c.req.query('cursor'));
  const visitor = (() => {
    const v = c.req.query('visitor');
    if (!v) return null;
    // Soft-validate: an invalid visitor_id just means we cannot compute
    // `liked`, it does not break the read. Hard validation happens on write.
    return /^visitor_[A-Za-z0-9_-]{6,48}$/.test(v) ? v : null;
  })();

  const supabase = createServiceClient(c.env);

  // 1. Fetch the page of posts (keyset: created_at < cursor.ts OR
  //    (created_at = cursor.ts AND id < cursor.id), order desc).
  let q = supabase
    .from('posts')
    .select('id, content, created_at, updated_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1); // +1 to detect next page

  if (cursor) {
    // Supabase PostgREST does not support composite keyset directly, so we
    // emulate with a single-column cursor by encoding (ts,id) into an
    // inclusive boundary using the lt filter on a computed boundary value.
    // Practical approach: filter created_at <= cursor.ts, then post-filter
    // by id when ts equals cursor.ts. Done after fetch.
    q = q.lt('created_at', cursor.ts);
  }

  const { data: rows, error } = await q;
  if (error) throw error;

  const pageRows = (rows ?? []) as PostRow[];

  // When using a cursor, also include posts AT cursor.ts with smaller ids
  // (the tiebreak). Fetch them and prepend.
  if (cursor && pageRows.length > 0) {
    const { data: tieRows } = await supabase
      .from('posts')
      .select('id, content, created_at, updated_at')
      .eq('created_at', cursor.ts)
      .lt('id', cursor.id)
      .order('id', { ascending: false })
      .limit(limit);
    if (tieRows && tieRows.length > 0) {
      pageRows.unshift(...(tieRows as PostRow[]));
    }
  }
  // Cap to the requested limit after the tie merge.
  const trimmed = pageRows.slice(0, limit);

  if (trimmed.length === 0) {
    const empty: ListResult<PostDTO> = { items: [], next_cursor: null };
    return ok(c, empty);
  }

  const postIds = trimmed.map((p) => p.id);

  // 2. Parallel: images + like counts + (optional) liked-by-visitor.
  const [imagesRes, countsRes, likedRes] = await Promise.all([
    supabase
      .from('post_images')
      .select('id, post_id, url, position, created_at')
      .in('post_id', postIds)
      .order('position', { ascending: true }),
    supabase.from('post_stats').select('post_id, like_count').in('post_id', postIds),
    visitor
      ? supabase
          .from('likes')
          .select('post_id')
          .eq('visitor_id', visitor)
          .in('post_id', postIds)
      : Promise.resolve({ data: [] as { post_id: string }[], error: null }),
  ]);

  if (imagesRes.error) throw imagesRes.error;
  if (countsRes.error) throw countsRes.error;
  if (likedRes.error) throw likedRes.error;

  // Index for O(1) lookup while building DTOs.
  const imagesByPost = new Map<string, PostImageRow[]>();
  for (const img of (imagesRes.data ?? []) as PostImageRow[]) {
    const arr = imagesByPost.get(img.post_id) ?? [];
    arr.push(img);
    imagesByPost.set(img.post_id, arr);
  }
  const countByPost = new Map<string, number>();
  for (const r of countsRes.data ?? []) {
    countByPost.set(r.post_id, r.like_count as number);
  }
  const likedSet = new Set((likedRes.data ?? []).map((r) => r.post_id));

  const items: PostDTO[] = trimmed.map((p) => ({
    id: p.id,
    content: p.content,
    images: (imagesByPost.get(p.id) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((i) => i.url),
    created_at: p.created_at,
    updated_at: p.updated_at,
    like_count: countByPost.get(p.id) ?? 0,
    liked: likedSet.has(p.id),
  }));

  // Next cursor is derived from the last item of the page (stable keyset).
  let next_cursor: string | null = null;
  const last = trimmed[trimmed.length - 1];
  // The "limit + 1" probe tells us more rows exist on the created_at axis;
  // combined with tie rows, we set the cursor whenever there *might* be more.
  const hasMore = rows != null && rows.length > limit;
  if (hasMore && last) {
    next_cursor = encodeCursor(last.created_at, last.id);
  }

  const result: ListResult<PostDTO> = { items, next_cursor };
  return ok(c, result);
});

/**
 * GET /api/posts/:id
 *
 * Query params:
 *   visitor optional, visitor_id to compute `liked`
 */
posts.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return fail(c, 404, ERR.NOT_FOUND, 'Post not found.');
  }
  const visitor = (() => {
    const v = c.req.query('visitor');
    return v && /^visitor_[A-Za-z0-9_-]{6,48}$/.test(v) ? v : null;
  })();

  const supabase = createServiceClient(c.env);

  const [{ data: post, error }, { data: images, error: imgErr }] = await Promise.all([
    supabase
      .from('posts')
      .select('id, content, created_at, updated_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('post_images')
      .select('id, post_id, url, position, created_at')
      .eq('post_id', id)
      .order('position', { ascending: true }),
  ]);
  if (error) throw error;
  if (imgErr) throw imgErr;
  if (!post) {
    return fail(c, 404, ERR.NOT_FOUND, 'Post not found.');
  }

  const { data: statsRow } = await supabase
    .from('post_stats')
    .select('like_count')
    .eq('post_id', id)
    .maybeSingle();

  let liked = false;
  if (visitor) {
    const { data: likeRow } = await supabase
      .from('likes')
      .select('id')
      .eq('post_id', id)
      .eq('visitor_id', visitor)
      .maybeSingle();
    liked = !!likeRow;
  }

  const dto: PostDTO = {
    id: (post as PostRow).id,
    content: (post as PostRow).content,
    images: ((images ?? []) as PostImageRow[])
      .sort((a, b) => a.position - b.position)
      .map((i) => i.url),
    created_at: (post as PostRow).created_at,
    updated_at: (post as PostRow).updated_at,
    like_count: (statsRow?.like_count as number) ?? 0,
    liked,
  };
  return ok(c, dto);
});

/* ============================================================
 * WRITES - author only (requireAuthor middleware).
 * ============================================================ */

/**
 * POST /api/posts
 *
 * Body: { content, image_urls?: string[] }
 * Returns: the created PostDTO.
 */
posts.post(
  '/',
  requireAuthor,
  async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, 400, ERR.BAD_REQUEST, 'Request body must be JSON.');
    }
    const input = assertPostInput(body);

    const supabase = createServiceClient(c.env);

    const { data: post, error } = await supabase
      .from('posts')
      .insert({ content: input.content })
      .select('id, content, created_at, updated_at')
      .single();
    if (error) throw error;

    // Insert images in one batch.
    if (input.image_urls.length > 0) {
      const imgRows = input.image_urls.map((url, i) => ({
        post_id: (post as PostRow).id,
        url,
        position: i,
      }));
      await supabase.from('post_images').insert(imgRows);
    }

    const dto: PostDTO = {
      id: (post as PostRow).id,
      content: (post as PostRow).content,
      images: input.image_urls,
      created_at: (post as PostRow).created_at,
      updated_at: (post as PostRow).updated_at,
      like_count: 0,
      liked: false,
    };
    return ok(c, dto, 201);
  },
);

/**
 * PATCH /api/posts/:id
 *
 * Body: { content, image_urls?: string[] }
 * Returns: the updated PostDTO.
 * image_urls replaces the existing set entirely.
 */
posts.patch(
  '/:id',
  requireAuthor,
  async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return fail(c, 404, ERR.NOT_FOUND, 'Post not found.');
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, 400, ERR.BAD_REQUEST, 'Request body must be JSON.');
    }
    const input = assertPostInput(body);

    const supabase = createServiceClient(c.env);

    // Verify the post exists.
    const { data: existing, error: findErr } = await supabase
      .from('posts')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) return fail(c, 404, ERR.NOT_FOUND, 'Post not found.');

    // Update content.
    const { data: post, error: updateErr } = await supabase
      .from('posts')
      .update({ content: input.content })
      .eq('id', id)
      .select('id, content, created_at, updated_at')
      .single();
    if (updateErr) throw updateErr;

    // Replace images: delete all existing, then insert the new set.
    await supabase.from('post_images').delete().eq('post_id', id);
    if (input.image_urls.length > 0) {
      const imgRows = input.image_urls.map((url, i) => ({
        post_id: id,
        url,
        position: i,
      }));
      await supabase.from('post_images').insert(imgRows);
    }

    // Recompute like_count.
    const like_count = await fetchLikeCount(supabase, id);

    const dto: PostDTO = {
      id: (post as PostRow).id,
      content: (post as PostRow).content,
      images: input.image_urls,
      created_at: (post as PostRow).created_at,
      updated_at: (post as PostRow).updated_at,
      like_count,
      liked: false,
    };
    return ok(c, dto);
  },
);

/**
 * DELETE /api/posts/:id
 *
 * Cascading delete (posts.on_delete_cascade removes images and likes).
 * Returns: { deleted: true }
 */
posts.delete(
  '/:id',
  requireAuthor,
  async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return fail(c, 404, ERR.NOT_FOUND, 'Post not found.');
    }

    const supabase = createServiceClient(c.env);

    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) throw error;

    return ok(c, { deleted: true });
  },
);

/* ============================================================
 * LIKES - public, visitor-scoped, idempotent.
 *
 * Duplicate prevention:
 *  - DB unique constraint on (post_id, visitor_id) is the source of truth.
 *  - We pre-check existence so the common path returns 200 not 409.
 *  - Rate-limited per IP (10 actions / minute) to slow brute-force likes.
 * ============================================================ */

/** Helper: fetch current like_count for a post, tolerating a missing view row. */
async function fetchLikeCount(
  supabase: ReturnType<typeof createServiceClient>,
  postId: string,
): Promise<number> {
  const { data } = await supabase
    .from('post_stats')
    .select('like_count')
    .eq('post_id', postId)
    .maybeSingle();
  return (data?.like_count as number) ?? 0;
}

/**
 * POST /api/posts/:id/like
 *
 * Body: { visitor_id }
 * Returns: { liked: true, like_count }
 * Idempotent: liking again returns the current count with liked: true.
 */
posts.post(
  '/:id/like',
  rateLimit({ bucket: 'like', limit: 10, windowSeconds: 60 }),
  async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return fail(c, 404, ERR.NOT_FOUND, 'Post not found.');
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, 400, ERR.BAD_REQUEST, 'Request body must be JSON.');
    }
    const visitorId = assertVisitorId((body as Record<string, unknown>)?.visitor_id);

    const supabase = createServiceClient(c.env);

    // Confirm the post exists (and is not deleted concurrently).
    const { data: post, error: postErr } = await supabase
      .from('posts')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (postErr) throw postErr;
    if (!post) return fail(c, 404, ERR.NOT_FOUND, 'Post not found.');

    // Pre-check: if already liked, short-circuit (idempotent).
    const { data: existing } = await supabase
      .from('likes')
      .select('id')
      .eq('post_id', id)
      .eq('visitor_id', visitorId)
      .maybeSingle();
    if (existing) {
      const like_count = await fetchLikeCount(supabase, id);
      return ok(c, { liked: true, like_count });
    }

    // Insert. The unique constraint is the final guard against a race where
    // two concurrent requests pass the pre-check; PostgREST returns 409.
    const { error: insertErr } = await supabase
      .from('likes')
      .insert({ post_id: id, visitor_id: visitorId });
    if (insertErr) {
      // 23505 = unique_violation. Treat as "already liked" -> idempotent ok.
      if ((insertErr as { code?: string }).code === '23505') {
        const like_count = await fetchLikeCount(supabase, id);
        return ok(c, { liked: true, like_count });
      }
      throw insertErr;
    }

    const like_count = await fetchLikeCount(supabase, id);
    return ok(c, { liked: true, like_count }, 201);
  },
);

/**
 * DELETE /api/posts/:id/like
 *
 * Body: { visitor_id }
 * Returns: { liked: false, like_count }
 * Idempotent: un-liking when not liked returns the current count.
 */
posts.delete(
  '/:id/like',
  rateLimit({ bucket: 'like', limit: 10, windowSeconds: 60 }),
  async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return fail(c, 404, ERR.NOT_FOUND, 'Post not found.');
    }

    // Body may be JSON or a query param; accept both for DELETE ergonomics.
    let visitorId: string | undefined;
    const fromQuery = c.req.query('visitor_id');
    if (fromQuery) {
      visitorId = fromQuery;
    } else {
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        visitorId = body?.visitor_id as string;
      } catch {
        visitorId = undefined;
      }
    }
    const valid = assertVisitorId(visitorId);

    const supabase = createServiceClient(c.env);

    const { error: delErr } = await supabase
      .from('likes')
      .delete()
      .eq('post_id', id)
      .eq('visitor_id', valid);
    if (delErr) throw delErr;

    const like_count = await fetchLikeCount(supabase, id);
    return ok(c, { liked: false, like_count });
  },
);

export default posts;
