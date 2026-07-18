-- ============================================================
-- MOMENTS — Cloudflare D1 (SQLite) schema
-- Single-author public moments feed. No Supabase.
--
-- Run with:
--   wrangler d1 execute moments --file=./db/schema.sql
--
-- Idempotent: safe to re-run.
--
-- Tables:  posts · post_images · likes
-- Author:  a single author authenticated by ADMIN_PASSWORD (not a users table).
-- Security: writes go only through the Worker (requireAuthor), which holds
--           the session secret. The public can read posts/images/likes.
-- ============================================================

CREATE TABLE IF NOT EXISTS posts (
  id          TEXT PRIMARY KEY,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL,   -- ISO8601 UTC
  updated_at  TEXT NOT NULL    -- ISO8601 UTC
);

CREATE TABLE IF NOT EXISTS post_images (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL,
  url         TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  media_type  TEXT NOT NULL DEFAULT 'image'
                CHECK(media_type IN ('image','gif','video','live')),
  poster_url  TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_post_images_post ON post_images(post_id);

CREATE TABLE IF NOT EXISTS likes (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL,
  visitor_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE(post_id, visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_visitor ON likes(visitor_id);

-- Single-row author profile (editable from /admin). id is always 'me'.
CREATE TABLE IF NOT EXISTS profile (
  id              TEXT PRIMARY KEY DEFAULT 'me',
  display_name    TEXT NOT NULL DEFAULT '',
  bio             TEXT NOT NULL DEFAULT '',
  avatar_url      TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT NOT NULL DEFAULT '',
  updated_at      TEXT NOT NULL
);

-- Keep updated_at fresh on edits (UTC ISO8601).
CREATE TRIGGER IF NOT EXISTS trg_posts_touch
AFTER UPDATE ON posts
BEGIN
  UPDATE posts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

-- Sidebar items for the three-column desktop layout
-- (left column / middle main area / right column).
-- Author-managed, publicly readable.
--   placement: 'left' | 'main' | 'right'  (which column the item shows in)
--   position : ordering within the same placement
--   image_url     : optional cropped image shown together with the text
--   image_position: 'above' | 'below' — image relative to the text content
CREATE TABLE IF NOT EXISTS sidebar (
  id       TEXT PRIMARY KEY,
  type     TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('image','text','markdown')),
  title    TEXT NOT NULL DEFAULT '',
  content  TEXT NOT NULL DEFAULT '',
  image_url      TEXT NOT NULL DEFAULT '',
  image_position TEXT NOT NULL DEFAULT 'above' CHECK(image_position IN ('above','below')),
  position INTEGER NOT NULL DEFAULT 0,
  placement TEXT NOT NULL DEFAULT 'right' CHECK(placement IN ('left','main','right')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sidebar_position ON sidebar(position);
CREATE INDEX IF NOT EXISTS idx_sidebar_placement ON sidebar(placement);

-- Site-wide interface background (whole-page image or video) + theme colors.
-- Single row id='default'. bg_type in ('none','image','video').
-- colors_json: JSON object of themable color tokens ('' = use default CSS).
CREATE TABLE IF NOT EXISTS site_settings (
  id         TEXT PRIMARY KEY DEFAULT 'default',
  bg_type    TEXT NOT NULL DEFAULT 'none' CHECK(bg_type IN ('none','image','video')),
  bg_url     TEXT NOT NULL DEFAULT '',
  colors_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
