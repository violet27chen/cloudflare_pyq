import { Hono } from 'hono';
import type { AppType } from '../types';
import { createServiceClient } from '../utils/supabase';
import { ok } from '../utils/response';
import { requireAuthor } from '../middleware/auth';

/**
 * Author-only stats.
 *
 *   GET /  -> { total_posts, total_likes, recent_7d: [{date, new_likes}] }
 */
export const stats = new Hono<AppType>();

stats.get('/', requireAuthor, async (c) => {
  const supabase = createServiceClient(c.env);

  const [
    { count: totalPosts },
    { count: totalLikes },
    { data: recentLikes },
  ] = await Promise.all([
    supabase
      .from('posts')
      .select('*', { count: 'exact', head: true }),
    supabase
      .from('likes')
      .select('*', { count: 'exact', head: true }),
    // Last 7 days of likes grouped by date (UTC).
    supabase.rpc('recent_likes_7d').then(async (r) => {
      // If the RPC does not exist yet, fall back to a simple query.
      if (r.error && r.error.code === '42883') {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
          .toISOString();
        const { data } = await supabase
          .from('likes')
          .select('created_at')
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: true });
        // Group by date.
        const byDate = new Map<string, number>();
        for (const row of data ?? []) {
          const d = (row.created_at as string).slice(0, 10);
          byDate.set(d, (byDate.get(d) ?? 0) + 1);
        }
        return {
          data: Array.from(byDate.entries())
            .map(([date, new_likes]) => ({ date, new_likes }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        };
      }
      if (r.error) throw r.error;
      return r;
    }),
  ]);

  return ok(c, {
    total_posts: totalPosts ?? 0,
    total_likes: totalLikes ?? 0,
    recent_7d: recentLikes ?? [],
  });
});

export default stats;
