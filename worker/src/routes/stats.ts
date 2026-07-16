import { Hono } from 'hono';
import type { AppType } from '../types';
import { ok } from '../utils/response';
import { requireAuthor } from '../middleware/auth';

/**
 * Author-only stats.
 *   GET /  -> { total_posts, total_likes, recent_7d: [{date, new_likes}] }
 */
export const stats = new Hono<AppType>();

stats.get('/', requireAuthor, async (c) => {
  const db = c.env.DB;
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [postsRow, likesRow, recent] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM posts`).first<{ c: number }>(),
    db.prepare(`SELECT COUNT(*) AS c FROM likes`).first<{ c: number }>(),
    db
      .prepare(
        `SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS new_likes
         FROM likes WHERE created_at >= ?
         GROUP BY date ORDER BY date ASC`,
      )
      .bind(sevenDaysAgo)
      .all(),
  ]);

  return ok(c, {
    total_posts: postsRow?.c ?? 0,
    total_likes: likesRow?.c ?? 0,
    recent_7d: (recent.results ?? []) as { date: string; new_likes: number }[],
  });
});

export default stats;
