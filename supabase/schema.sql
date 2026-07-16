-- ============================================================
-- MOMENTS — Supabase PostgreSQL schema
-- Single-author public moments feed.
--
-- Run in the Supabase SQL editor (or `supabase db push`).
-- Idempotent: safe to re-run.
--
-- Tables:  posts · post_images · likes
-- Author:  uses Supabase Auth (auth.users), no custom users table.
-- Security: RLS = public read, write only via service_role (Worker).
-- ============================================================

-- Needed for gen_random_uuid() on older PG; Supabase has it by default.
create extension if not exists pgcrypto;

-- ============================================================
-- 1. POSTS
-- ============================================================
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  content     text not null
              check (char_length(content) between 1 and 5000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- 2. POST IMAGES (1 post -> N images, ordered)
-- ============================================================
create table if not exists public.post_images (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  url         text not null,
  position    smallint not null default 0
              check (position between 0 and 8),
  created_at  timestamptz not null default now()
);
create index if not exists idx_post_images_post
  on public.post_images(post_id);
create index if not exists idx_post_images_position
  on public.post_images(post_id, position);

-- ============================================================
-- 3. LIKES (unique constraint prevents duplicate likes per visitor)
-- ============================================================
create table if not exists public.likes (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  visitor_id  text not null
              check (visitor_id like 'visitor_%'
                     and char_length(visitor_id) <= 64),
  created_at  timestamptz not null default now(),
  constraint uq_post_visitor unique (post_id, visitor_id)
);
create index if not exists idx_likes_post
  on public.likes(post_id);
create index if not exists idx_likes_visitor
  on public.likes(visitor_id);
create index if not exists idx_likes_post_created
  on public.likes(post_id, created_at);

-- ============================================================
-- 4. updated_at auto-maintenance trigger
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_posts_touch on public.posts;
create trigger trg_posts_touch
  before update on public.posts
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 5. like_count helper view
--    Pre-aggregated counts so the read API avoids N+1 queries.
-- ============================================================
create or replace view public.post_stats as
select
  p.id as post_id,
  coalesce(lc.cnt, 0)::int as like_count
from public.posts p
left join (
  select post_id, count(*) as cnt
  from public.likes
  group by post_id
) lc on lc.post_id = p.id;

-- ============================================================
-- 6. ROW LEVEL SECURITY
--    Principle: the public can read everything; nobody can write
--    through the anon/auth keys. All writes go through the Worker,
--    which uses the service_role key (bypasses RLS).
-- ============================================================
alter table public.posts       enable row level security;
alter table public.post_images enable row level security;
alter table public.likes       enable row level security;

-- --- public read policies ---
drop policy if exists "posts_select_public"   on public.posts;
drop policy if exists "post_images_select_public" on public.post_images;
drop policy if exists "likes_select_public"   on public.likes;

create policy "posts_select_public"
  on public.posts for select
  using (true);

create policy "post_images_select_public"
  on public.post_images for select
  using (true);

-- Likes are readable so the client can compute `liked` for a visitor.
-- We expose only (post_id, created_at); visitor_id is intentionally NOT
-- needed by clients, but is included because Supabase returns full rows.
-- If stricter privacy is desired later, replace the view below with an
-- RPC that only returns counts + a boolean for the requesting visitor.
create policy "likes_select_public"
  on public.likes for select
  using (true);

-- NOTE: no INSERT / UPDATE / DELETE policies are defined.
-- With RLS enabled and no write policies, anon + authenticated roles
-- CANNOT modify data. Only service_role (used by the Worker) bypasses RLS.
-- This is the intended defense-in-depth: even a leaked anon key cannot
-- create posts or forge likes.

-- ============================================================
-- 7. STORAGE BUCKET for post images (public read, service write)
--    Create the bucket via Supabase Dashboard > Storage, or run:
-- ============================================================
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

-- Storage RLS: public read; writes only via service_role.
drop policy if exists "post_images_storage_read" on storage.objects;
create policy "post_images_storage_read"
  on storage.objects for select
  using (bucket_id = 'post-images');
-- No upload policy for anon/auth: only service_role can upload (via Worker).
