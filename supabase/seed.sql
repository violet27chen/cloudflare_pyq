-- ============================================================
-- MOMENTS — seed data (development / preview only)
-- Run AFTER schema.sql. Safe to re-run (deletes then inserts).
-- Produces a realistic timeline with varied image counts & likes.
-- ============================================================

begin;

-- Wipe in dependency order (images/likes depend on posts).
delete from public.likes;
delete from public.post_images;
delete from public.posts;

-- Seed a handful of posts spread across the last few days.
-- created_at is set relative to now() so the timeline always looks fresh.
insert into public.posts (id, content, created_at) values
  (
    'a0000000-0000-0000-0000-000000000001',
    'First light at the harbor before the city wakes. The water was a sheet of glass and the only sound was a single rope tapping a mast.',
    now() - interval '6 hours'
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'Spent the afternoon rewriting the slow query that has been haunting this project. Down from 1.8s to 42ms. Sometimes the answer is just an index that should have existed all along.',
    now() - interval '26 hours'
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    'Three chapters into the book on the desk. The kind that makes you forget you are reading.',
    now() - interval '2 days'
  ),
  (
    'a0000000-0000-0000-0000-000000000004',
    'Kitchen experiment: miso brown butter on roasted carrots. Worth the mess.',
    now() - interval '4 days'
  ),
  (
    'a0000000-0000-0000-0000-000000000005',
    'Shipping the v2 timeline today. Cleaner cards, faster likes, and the admin finally does not feel like a CMS. Small wins compound.',
    now() - interval '6 days'
  );

-- Images reference picsum.photos seeds so they render without uploads.
insert into public.post_images (post_id, url, position) values
  ('a0000000-0000-0000-0000-000000000001',
   'https://picsum.photos/seed/moments-harbor-dawn/1200/900', 0),
  ('a0000000-0000-0000-0000-000000000001',
   'https://picsum.photos/seed/moments-harbor-rope/1200/900', 1),
  ('a0000000-0000-0000-0000-000000000002',
   'https://picsum.photos/seed/moments-code-terminal/1600/1000', 0),
  ('a0000000-0000-0000-0000-000000000004',
   'https://picsum.photos/seed/moments-carrots-plate/1000/1000', 0),
  ('a0000000-0000-0000-0000-000000000004',
   'https://picsum.photos/seed/moments-kitchen-mise/1000/1000', 1),
  ('a0000000-0000-0000-0000-000000000004',
   'https://picsum.photos/seed/moments-butter-pan/1000/1000', 2);

-- Some likes so counts look alive.
insert into public.likes (post_id, visitor_id) values
  ('a0000000-0000-0000-0000-000000000001', 'visitor_seed_0001'),
  ('a0000000-0000-0000-0000-000000000001', 'visitor_seed_0002'),
  ('a0000000-0000-0000-0000-000000000001', 'visitor_seed_0003'),
  ('a0000000-0000-0000-0000-000000000002', 'visitor_seed_0001'),
  ('a0000000-0000-0000-0000-000000000002', 'visitor_seed_0004'),
  ('a0000000-0000-0000-0000-000000000004', 'visitor_seed_0005');

commit;

-- Verify the feed shape.
select
  p.id,
  left(p.content, 40) as preview,
  p.created_at,
  (select count(*) from public.post_images i where i.post_id = p.id) as imgs,
  (select count(*) from public.likes l where l.post_id = p.id) as likes
from public.posts p
order by p.created_at desc;
