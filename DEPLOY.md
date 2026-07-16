# Moments - Deployment Guide

Deploy the full stack: Supabase (data) + Cloudflare Worker (API) + Cloudflare Pages (frontend).

## Prerequisites

- Cloudflare account (free tier works)
- Supabase account (free tier works)
- Node.js 20+ and pnpm installed locally
- `wrangler` CLI authenticated: `wrangler login`

## Step 1: Supabase

Follow [`supabase/README.md`](./supabase/README.md):

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. (Optional) Run `supabase/seed.sql` for sample data.
4. Create the author account in Authentication > Users.
5. Note down: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`.

## Step 2: Cloudflare Worker (API)

```bash
cd worker

# Set secrets (never commit these)
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put ADMIN_JWT_SECRET   # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
wrangler secret put STORAGE_BUCKET     # value: post-images

# Deploy
pnpm deploy
```

Note the Worker URL (e.g. `https://moments-api.<your-subdomain>.workers.dev`).

## Step 3: Cloudflare Pages (Frontend)

### Option A: Git integration (recommended)

1. Push this repo to GitHub/GitLab.
2. Cloudflare Dashboard > Pages > Create project > Connect to Git.
3. Build settings:
   - **Framework preset**: Astro
   - **Build command**: `cd frontend && pnpm build`
   - **Build output directory**: `frontend/dist`
   - **Root directory**: `/` (repo root)
4. Environment variables (Pages dashboard > Settings > Environment variables):
   - `PUBLIC_API_BASE` = your Worker URL (e.g. `https://moments-api.xxx.workers.dev`)
   - `PUBLIC_AUTHOR_NAME` = your display name (e.g. `L.`)
   - `PUBLIC_SUPABASE_URL` = your Supabase project URL
   - `PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key

### Option B: Direct upload

```bash
cd frontend
pnpm build
wrangler pages deploy dist --project-name=moments
```

Then set the same environment variables in the Pages dashboard.

## Step 4: Custom domain (optional)

1. Pages dashboard > your project > Custom domains > Add domain.
2. Worker dashboard > your worker > Triggers > Custom domains > Add `api.yourdomain.com`.
3. Update `PUBLIC_API_BASE` to `https://api.yourdomain.com`.

## Step 5: Verify

```bash
# Health check
curl https://your-worker.workers.dev/api/health

# Feed (should return posts or empty list)
curl https://your-worker.workers.dev/api/posts

# Frontend
open https://your-pages-project.pages.dev
```

## Architecture recap

```
Browser
  |
  +-- Cloudflare Pages (Astro + React)
  |     /          -> public feed (SSG + client islands)
  |     /admin     -> author panel (SPA)
  |
  +-- Cloudflare Worker (Hono)
  |     /api/posts       GET  (public, cursor pagination)
  |     /api/posts/:id   GET  (public)
  |     /api/posts       POST (author JWT)
  |     /api/posts/:id   PATCH/DELETE (author JWT)
  |     /api/posts/:id/like  POST/DELETE (visitor)
  |     /api/upload      POST (author JWT, multipart)
  |     /api/auth/session POST (exchange Supabase JWT)
  |     /api/stats       GET  (author JWT)
  |
  +-- Supabase
        PostgreSQL  (posts, post_images, likes + RLS)
        Storage     (post-images bucket, public read)
        Auth        (single author account)
```

## Security checklist

- [x] RLS enabled on all tables (public read, no anon write)
- [x] Unique constraint on (post_id, visitor_id) prevents duplicate likes
- [x] Author mutations require JWT (Moments session token)
- [x] Image upload validates MIME type + size (8MB max)
- [x] Rate limiting on like endpoints (10/min per IP)
- [x] Parameterized queries (Supabase client, no raw SQL from user input)
- [x] CORS configured for same-origin + explicit origins
- [x] Service role key never exposed to browser
- [x] Turnstile placeholder ready (X-Turnstile-Token header accepted in CORS)
