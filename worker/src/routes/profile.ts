import { Hono } from 'hono';
import type { AppType, ProfileDTO } from '../types';
import { ok, fail, ERR } from '../utils/response';
import { assertProfileInput } from '../utils/validate';
import { requireAuthor } from '../middleware/auth';

/**
 * Profile route (Cloudflare D1 / SQLite backend).
 *
 *   GET  /        public read of the single author profile
 *   PUT  /        update profile   [author]
 */
export const profile = new Hono<AppType>();

const DEFAULT_PROFILE: ProfileDTO = {
  display_name: 'L.',
  bio: '',
  avatar_url: '',
  cover_image_url: '',
};

function rowToDTO(
  r: { display_name: string; bio: string; avatar_url: string; cover_image_url: string } | null,
): ProfileDTO {
  if (!r) return DEFAULT_PROFILE;
  return {
    display_name: r.display_name || DEFAULT_PROFILE.display_name,
    bio: r.bio || '',
    avatar_url: r.avatar_url || '',
    cover_image_url: r.cover_image_url || '',
  };
}

/**
 * GET /api/profile — public.
 */
profile.get('/', async (c) => {
  const row = await c.env.DB
    .prepare(`SELECT display_name, bio, avatar_url, cover_image_url FROM profile WHERE id = 'me'`)
    .first<{ display_name: string; bio: string; avatar_url: string; cover_image_url: string }>();
  return ok<ProfileDTO>(c, rowToDTO(row));
});

/**
 * PUT /api/profile — update [author]
 * Body: { display_name?, bio?, avatar_url?, cover_image_url? }
 */
profile.put('/', requireAuthor, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 400, ERR.BAD_REQUEST, 'Request body must be JSON.');
  }
  const input = assertProfileInput(body);
  const now = new Date().toISOString();

  await c.env.DB
    .prepare(
      `INSERT INTO profile (id, display_name, bio, avatar_url, cover_image_url, updated_at)
       VALUES ('me', ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         display_name = excluded.display_name,
         bio = excluded.bio,
         avatar_url = excluded.avatar_url,
         cover_image_url = excluded.cover_image_url,
         updated_at = excluded.updated_at`,
    )
    .bind(input.display_name, input.bio, input.avatar_url, input.cover_image_url, now)
    .run();

  return ok<ProfileDTO>(c, {
    display_name: input.display_name,
    bio: input.bio,
    avatar_url: input.avatar_url,
    cover_image_url: input.cover_image_url,
  });
});

export default profile;
