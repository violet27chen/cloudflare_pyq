-- 0002: sidebar items can carry an image alongside text/markdown.
-- Applied once via `wrangler d1 migrations apply moments --remote`.
--   image_url      : optional cropped image URL (may be /img/... or http)
--   image_position : 'above' | 'below' — image relative to the text content

ALTER TABLE sidebar ADD COLUMN image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE sidebar ADD COLUMN image_position TEXT NOT NULL DEFAULT 'above';
