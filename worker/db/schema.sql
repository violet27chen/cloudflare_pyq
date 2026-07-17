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

-- Sidebar items for the desktop two-column layout.
-- Author-managed, publicly readable.
CREATE TABLE IF NOT EXISTS sidebar (
  id       TEXT PRIMARY KEY,
  type     TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('image','text','markdown')),
  title    TEXT NOT NULL DEFAULT '',
  content  TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sidebar_position ON sidebar(position);
