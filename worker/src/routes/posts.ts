import { Hono } from 'hono';
import type { AppType, PostDTO, PostRow, PostImageRow, ListResult } from '../types';
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
 * Posts routes (Cloudflare D1 / SQLite backend).
 *
 *   GET    /                  list (keyset pagination)
 *   GET    /:id               single post
 *   POST   /                  create            [author]
 *   PATCH  /:id               edit              [author]
 *   DELETE /:id               delete            [author]
 *   POST   /:id/like          like              [visitor]
 *   DELETE /:id/like          unlike            [visitor]
 */
export const posts = new Hono<AppType>();

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;
const VISITOR_RE = /^visitor_[A-Za-z0-9_-]{6,48}$/;

function softVisitor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return VISITOR_RE.test(raw) ? raw : null;
}

/** Helper: fetch current like_count for a post. */
async function likeCount(db: D1Database, postId: string): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(*) AS c FROM likes WHERE post_id = ?`)
    .bind(postId)
    .first<{ c: number }>();
  return r?.c ?? 0;
}

function imgInsertStmt(db: D1Database, postId: string, imageUrls: string[]) {
  const now = new Date().toISOString();
  const rows = imageUrls.map((url, i) => [crypto.randomUUID(), postId, url, i, now]);
  const placeholders = rows.map(() => '(?, ?, ?, ?, ?)').join(',');
  const flat: unknown[] = [];
  for (const r of rows) flat.push(...r);
  return db
    .prepare(
      `INSERT INTO post_images (id, post_id, url, position, created_at) VALUES ${placeholders}`,
    )
    .bind(...flat);
}

/**
 * GET /api/posts — newest-first, keyset pagination on (created_at, id).
 * like_count is computed via a correlated subquery; images and optional
 * liked-by-visitor are fetched in parallel.
 */
posts.get('/', async (c) => {
  const limit = parseIntQuery(c.req.query('limit'), {
    default: DEFAULT_LIMIT,
    min: 1,
    max: MAX_LIMIT,
  });
  const cursor = decodeCursor(c.req.query('cursor'));
  const visitor = softVisitor(c.req.query('visitor'));
  const db = c.env.DB;

  let sql = `SELECT id, content, created_at, updated_at,
    (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count
    FROM posts p`;
  const binds: (string | number)[] = [];
  if (cursor) {
    sql += ` WHERE (p.created_at < ? OR (p.created_at = ? AND p.id < ?))`;
    binds.push(cursor.ts, cursor.ts, cursor.id);
  }
  sql += ` ORDER BY p.created_at DESC, p.id DESC LIMIT ?`;
  binds.push(limit + 1);

  const { results } = await db
    .prepare(sql)
    .bind(...binds)
    .all<PostRow & { like_count: number }>();
  const rows = results ?? [];

  const hasMore = rows.length > limit;
  const trimmed = rows.slice(0, limit);
  if (trimmed.length === 0) {
    return ok<ListResult<PostDTO>>(c, { items: [], next_cursor: null });
  }

  const postIds = trimmed.map((p) => p.id);
  const placeholders = postIds.map(() => '?').join(',');

  const [imgRes, likedRes] = await Promise.all([
    db
      .prepare(
        `SELECT id, post_id, url, position, created_at FROM post_images
         WHERE post_id IN (${placeholders}) ORDER BY position ASC`,
      )
      .bind(...postIds)
      .all<PostImageRow>(),
    visitor
      ? db
          .prepare(
            `SELECT post_id FROM likes WHERE visitor_id = ? AND post_id IN (${placeholders})`,
          )
          .bind(visitor, ...postIds)
          .all<{ post_id: string }>()
      : Promise.resolve({ results: [] as { post_id: string }[] }),
  ]);

  const imagesByPost = new Map<string, PostImageRow[]>();
  for (const img of imgRes.results ?? []) {
    const arr = imagesByPost.get(img.post_id) ?? [];
    arr.push(img);
    imagesByPost.set(img.post_id, arr);
  }
  const likedSet = new Set<string>();
  for (const r of likedRes.results ?? []) {
    likedSet.add(r.post_id);
  }

  const items: PostDTO[] = trimmed.map((p) => ({
    id: p.id,
    content: p.content,
    images: (imagesByPost.get(p.id) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((i) => i.url),
    created_at: p.created_at,
    updated_at: p.updated_at,
    like_count: p.like_count ?? 0,
    liked: likedSet.has(p.id),
  }));

  let next_cursor: string | null = null;
  const last = trimmed[trimmed.length - 1];
  if (hasMore && last) next_cursor = encodeCursor(last.created_at, last.id);

  return ok<ListResult<PostDTO>>(c, { items, next_cursor });
});

/**
 * GET /api/posts/:id
 */
posts.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return fail(c, 404, ERR.NOT_FOUND, 'Post not found.');
  }
  const visitor = softVisitor(c.req.query('visitor'));
  const db = c.env.DB;

  const post = await db
    .prepare(
      `SELECT id, content, created_at, updated_at,
        (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count
       FROM posts p WHERE p.id = ?`,
    )
    .bind(id)
    .first<PostRow & { like_count: number }>();
  if (!post) return fail(c, 404, ERR.NOT_FOUND, 'Post not found.');

  const imgRes = await db
    .prepare(
      `SELECT id, post_id, url, position, created_at FROM post_images
       WHERE post_id = ? ORDER BY position ASC`,
    )
    .bind(id)
    .all<PostImageRow>();
  const images = imgRes.results ?? [];

  let liked = false;
  if (visitor) {
    const likeRow = await db
      .prepare(`SELECT id FROM likes WHERE post_id = ? AND visitor_id = ?`)
      .bind(id, visitor)
      .first();
    liked = !!likeRow;
  }

  const dto: PostDTO = {
    id: post.id,
    content: post.content,
    images: images.map((i) => i.url),
    created_at: post.created_at,
    updated_at: post.updated_at,
    like_count: post.like_count ?? 0,
    liked,
  };
  return ok<PostDTO>(c, dto);
});

/**
 * POST /api/posts — create [author]
 * Body: { content, image_urls?: string[] }
 */
posts.post('/', requireAuthor, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 400, ERR.BAD_REQUEST, 'Request body must be JSON.');
  }
  const input = assertPostInput(body);
  const db = c.env.DB;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(`INSERT INTO posts (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)`)
    .bind(id, input.content, now, now)
    .run();

  if (input.image_urls.length > 0) {
    await imgInsertStmt(db, id, input.image_urls).run();
  }

  const dto: PostDTO = {
    id,
    content: input.content,
    images: input.image_urls,
    created_at: now,
    updated_at: now,
    like_count: 0,
    liked: false,
  };
  return ok<PostDTO>(c, dto, 201);
});

/**
 * PATCH /api/posts/:id — edit [author]
 * Body: { content, image_urls?: string[] }  (replaces images entirely)
 */
posts.patch('/:id', requireAuthor, async (c) => {
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
  const db = c.env.DB;

  const existing = await db
    .prepare(`SELECT id FROM posts WHERE id = ?`)
    .bind(id)
    .first();
  if (!existing) return fail(c, 404, ERR.NOT_FOUND, 'Post not found.');

  await db
    .prepare(`UPDATE posts SET content = ?, updated_at = ? WHERE id = ?`)
    .bind(input.content, new Date().toISOString(), id)
    .run();

  // Replace images: delete existing, then insert the new set.
  await db.prepare(`DELETE FROM post_images WHERE post_id = ?`).bind(id).run();
  if (input.image_urls.length > 0) {
    await imgInsertStmt(db, id, input.image_urls).run();
  }

  const like_count = await likeCount(db, id);
  const updated = await db
    .prepare(`SELECT content, created_at, updated_at FROM posts WHERE id = ?`)
    .bind(id)
    .first<PostRow>();

  const dto: PostDTO = {
    id,
    content: updated?.content ?? input.content,
    images: input.image_urls,
    created_at: updated?.created_at ?? new Date().toISOString(),
    updated_at: updated?.updated_at ?? new Date().toISOString(),
    like_count,
    liked: false,
  };
  return ok<PostDTO>(c, dto);
});

/**
 * DELETE /api/posts/:id — delete [author]
 * Children removed explicitly (robust regardless of FK pragma).
 */
posts.delete('/:id', requireAuthor, async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return fail(c, 404, ERR.NOT_FOUND, 'Post not found.');
  }
  const db = c.env.DB;
  await db.prepare(`DELETE FROM post_images WHERE post_id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM likes WHERE post_id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM posts WHERE id = ?`).bind(id).run();
  return ok(c, { deleted: true });
});

/**
 * POST /api/posts/:id/like — like [visitor], idempotent.
 * Body: { visitor_id }
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
    const db = c.env.DB;

    const post = await db
      .prepare(`SELECT id FROM posts WHERE id = ?`)
      .bind(id)
      .first();
    if (!post) return fail(c, 404, ERR.NOT_FOUND, 'Post not found.');

    const existing = await db
      .prepare(`SELECT id FROM likes WHERE post_id = ? AND visitor_id = ?`)
      .bind(id, visitorId)
      .first();
    if (existing) {
      const like_count = await likeCount(db, id);
      return ok(c, { liked: true, like_count });
    }

    await db
      .prepare(
        `INSERT OR IGNORE INTO likes (id, post_id, visitor_id, created_at) VALUES (?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), id, visitorId, new Date().toISOString())
      .run();

    const like_count = await likeCount(db, id);
    return ok(c, { liked: true, like_count }, 201);
  },
);

/**
 * DELETE /api/posts/:id/like — unlike [visitor], idempotent.
 * Body or query param: { visitor_id }
 */
posts.delete(
  '/:id/like',
  rateLimit({ bucket: 'like', limit: 10, windowSeconds: 60 }),
  async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return fail(c, 404, ERR.NOT_FOUND, 'Post not found.');
    }
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

    const db = c.env.DB;
    await db
      .prepare(`DELETE FROM likes WHERE post_id = ? AND visitor_id = ?`)
      .bind(id, valid)
      .run();

    const like_count = await likeCount(db, id);
    return ok(c, { liked: false, like_count });
  },
);

export default posts;
