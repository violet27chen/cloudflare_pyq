import { Hono } from 'hono';
import type { AppType, SiteSettingsDTO } from '../types';
import { ok, fail, ERR } from '../utils/response';
import { assertSettingsInput, parseThemeColors } from '../utils/validate';
import { requireAuthor } from '../middleware/auth';

/**
 * Site-wide interface background (whole-page image or video) + theme colors.
 *
 *   GET  /        public read of the single site_settings row
 *   PUT  /        update bg_type + bg_url + colors   [author]
 */
export const settings = new Hono<AppType>();

const DEFAULT_COLORS = parseThemeColors({});

const DEFAULT_SETTINGS: SiteSettingsDTO = {
  bg_type: 'none',
  bg_url: '',
  colors: DEFAULT_COLORS,
};

interface SettingsRow {
  bg_type: string;
  bg_url: string;
  colors_json: string | null;
}

/**
 * GET /api/settings — public.
 */
settings.get('/', async (c) => {
  const row = await c.env.DB
    .prepare(
      `SELECT bg_type, bg_url, colors_json FROM site_settings WHERE id = 'default'`,
    )
    .first<SettingsRow>();
  if (!row) return ok<SiteSettingsDTO>(c, DEFAULT_SETTINGS);

  const bgType = (['none', 'image', 'video'].includes(row.bg_type)
    ? row.bg_type
    : 'none') as SiteSettingsDTO['bg_type'];

  let colors = DEFAULT_COLORS;
  if (row.colors_json) {
    try {
      colors = parseThemeColors(JSON.parse(row.colors_json));
    } catch {
      colors = DEFAULT_COLORS;
    }
  }

  return ok<SiteSettingsDTO>(c, {
    bg_type: bgType,
    bg_url: row.bg_url,
    colors,
  });
});

/**
 * PUT /api/settings — update [author]
 * Body: { bg_type?, bg_url?, colors? }
 */
settings.put('/', requireAuthor, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 400, ERR.BAD_REQUEST, 'Request body must be JSON.');
  }
  const input = assertSettingsInput(body);
  const now = new Date().toISOString();
  const colorsJson = JSON.stringify(input.colors);

  await c.env.DB
    .prepare(
      `INSERT INTO site_settings (id, bg_type, bg_url, colors_json, updated_at)
       VALUES ('default', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         bg_type = excluded.bg_type,
         bg_url = excluded.bg_url,
         colors_json = excluded.colors_json,
         updated_at = excluded.updated_at`,
    )
    .bind(input.bg_type, input.bg_url, colorsJson, now)
    .run();

  return ok<SiteSettingsDTO>(c, {
    bg_type: input.bg_type,
    bg_url: input.bg_url,
    colors: input.colors,
  });
});

export default settings;
