import { Hono } from 'hono';
import type { AppType } from '../types';
import { ok, fail, ERR } from '../utils/response';
import { requireAuthor } from '../middleware/auth';

/**
 * Sidebar items route.
 *
 *   GET  /        public read of all sidebar items (ordered by position)
 *   POST /       create a sidebar item [author]
 *   DELETE /:id  delete a sidebar item [author]
 */
export const sidebar = new Hono<AppType>();

/** Shape returned to the browser. */
interface SidebarItemDTO {
  id: string;
  type: 'image' | 'text' | 'markdown';
  title: string;
  content: string;
  position: number;
  placement: 'left' | 'main' | 'right';
}

const VALID_TYPES = new Set(['image', 'text', 'markdown']);
const VALID_PLACEMENTS = new Set(['left', 'main', 'right']);

/**
 * GET /api/sidebar — public, ordered by placement then position.
 */
sidebar.get('/', async (c) => {
  const rows = await c.env.DB
    .prepare(
      `SELECT id, type, title, content, position, placement FROM sidebar
       ORDER BY placement ASC, position ASC, created_at ASC`,
    )
    .all<SidebarItemDTO>();
  return ok(c, rows.results ?? []);
});

/**
 * POST /api/sidebar — create [author]
 * Body: { type, title, content, position?, placement? }
 */
sidebar.post('/', requireAuthor, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 400, ERR.BAD_REQUEST, '请求体必须是 JSON。');
  }
  const b = body as Record<string, unknown>;

  const type = typeof b.type === 'string' && VALID_TYPES.has(b.type) ? b.type : 'text';
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const content = typeof b.content === 'string' ? b.content : '';
  const position = typeof b.position === 'number' ? b.position : 0;
  const placement =
    typeof b.placement === 'string' && VALID_PLACEMENTS.has(b.placement)
      ? (b.placement as 'left' | 'main' | 'right')
      : 'right';

  if (!content) {
    return fail(c, 422, ERR.VALIDATION, '内容不能为空。');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB
    .prepare(
      `INSERT INTO sidebar (id, type, title, content, position, placement, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, type, title, content, position, placement, now)
    .run();

  return ok(c, {
    id,
    type: type as SidebarItemDTO['type'],
    title,
    content,
    position,
    placement,
  });
});

/**
 * DELETE /api/sidebar/:id — delete [author]
 */
sidebar.delete('/:id', requireAuthor, async (c) => {
  const id = c.req.param('id');
  // Validate UUID format
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return fail(c, 400, ERR.BAD_REQUEST, '无效的 ID 格式。');
  }

  const result = await c.env.DB
    .prepare(`DELETE FROM sidebar WHERE id = ?`)
    .bind(id)
    .run();

  if (!result.meta.changes || result.meta.changes === 0) {
    return fail(c, 404, ERR.NOT_FOUND, '侧边栏内容不存在。');
  }

  return ok(c, { deleted: true });
});

export default sidebar;
