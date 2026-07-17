-- 0001: add sidebar.placement + site_settings table.
-- Applied once via `wrangler d1 migrations apply moments --remote`.
-- Safe to include in fresh DBs too (CREATE TABLE IF NOT EXISTS).

ALTER TABLE sidebar ADD COLUMN placement TEXT NOT NULL DEFAULT 'right';

CREATE TABLE IF NOT EXISTS site_settings (
  id         TEXT PRIMARY KEY DEFAULT 'default',
  bg_type    TEXT NOT NULL DEFAULT 'none' CHECK(bg_type IN ('none','image','video')),
  bg_url     TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
