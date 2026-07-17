-- ============================================================
-- MOMENTS — D1 seed data (development / preview only)
-- Run AFTER schema.sql. Safe to re-run (wipes then inserts).
-- Produces a realistic timeline with varied image counts & likes.
-- ============================================================

DELETE FROM likes;
DELETE FROM post_images;
DELETE FROM posts;

INSERT INTO posts (id, content, created_at, updated_at) VALUES
  ('a0000000-0000-0000-0000-000000000001',
   'First light at the harbor before the city wakes. The water was a sheet of glass and the only sound was a single rope tapping a mast.',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 hours'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('a0000000-0000-0000-0000-000000000002',
   'Spent the afternoon rewriting the slow query that has been haunting this project. Down from 1.8s to 42ms. Sometimes the answer is just an index that should have existed all along.',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-26 hours'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('a0000000-0000-0000-0000-000000000003',
   'Three chapters into the book on the desk. The kind that makes you forget you are reading.',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('a0000000-0000-0000-0000-000000000004',
   'Kitchen experiment: miso brown butter on roasted carrots. Worth the mess.',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('a0000000-0000-0000-0000-000000000005',
   'Shipping the v2 timeline today. Cleaner cards, faster likes, and the admin finally does not feel like a CMS. Small wins compound.',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 days'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Images reference picsum.photos seeds so they render without uploads.
INSERT INTO post_images (id, post_id, url, position, created_at) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'https://picsum.photos/seed/moments-harbor-dawn/1200/900', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'https://picsum.photos/seed/moments-harbor-rope/1200/900', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'https://picsum.photos/seed/moments-code-terminal/1600/1000', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'https://picsum.photos/seed/moments-carrots-plate/1000/1000', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000004', 'https://picsum.photos/seed/moments-kitchen-mise/1000/1000', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000004', 'https://picsum.photos/seed/moments-butter-pan/1000/1000', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Some likes so counts look alive.
INSERT INTO likes (id, post_id, visitor_id, created_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'visitor_seed_0001', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'visitor_seed_0002', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'visitor_seed_0003', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'visitor_seed_0001', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'visitor_seed_0004', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('c0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000004', 'visitor_seed_0005', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Author profile (editable from /admin).
INSERT INTO profile (id, display_name, bio, avatar_url, cover_image_url, updated_at) VALUES
  ('me', 'L.', 'Sharing moments, one at a time.', '', '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
