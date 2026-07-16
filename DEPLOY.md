# Moments - Deployment Guide

Deploy the whole app from a single Cloudflare Worker: API + built frontend + images, backed by **D1** (SQLite) and **R2**.

## Architecture

A single Cloudflare Worker (`moments-api`) serves everything:

- `/` and `/admin/`  → built frontend (Astro static output, served via Static Assets)
- `/api/*`           → Hono API (posts, auth, upload, stats)
- `/img/*`           → R2 images, served same-origin

Data lives in **D1** (SQLite): `posts`, `post_images`, `likes`.
Images live in **R2**: bucket `moments-images`.
Admin auth is password-based: `POST /api/auth/session` returns a JWT signed with `ADMIN_JWT_SECRET`.

## Prerequisites

- Cloudflare account (free tier works)
- Node.js 20+ and pnpm
- `wrangler` authenticated: `wrangler login`

## One-click (Deploy to Cloudflare button)

The README badge starts Cloudflare's deploy flow. The repo is a monorepo (the Worker lives in `worker/`), so if the flow doesn't pick up `worker/wrangler.toml`, follow the manual steps below.

## Manual deploy

```bash
# 1. Clone & install
git clone https://github.com/violet27chen/cloudflare_pyq
cd cloudflare_pyq && pnpm install

# 2. Create resources
wrangler d1 create moments
wrangler r2 bucket create moments-images
#   -> copy the D1 database_id into worker/wrangler.toml:
#      [[d1_databases]] binding = "DB" database_name = "moments" database_id = "<id>"

# 3. Secrets (never commit)
wrangler secret put ADMIN_JWT_SECRET --name moments-api   # e.g. openssl rand -hex 32
wrangler secret put ADMIN_PASSWORD --name moments-api     # your admin login password

# 4. Schema + seed (REMOTE D1 — do not omit --remote)
cd worker
wrangler d1 execute moments --remote --file=./db/schema.sql
wrangler d1 execute moments --remote --file=./db/seed.sql

# 5. Deploy (builds frontend, then deploys the Worker)
pnpm deploy
```

## Verify

```bash
curl https://<your-subdomain>.workers.dev/api/health
curl https://<your-subdomain>.workers.dev/api/posts
# open https://<your-subdomain>.workers.dev/       (feed)
# open https://<your-subdomain>.workers.dev/admin/ (log in with ADMIN_PASSWORD)
```

## Custom domain (optional)

Worker dashboard > your worker > Triggers > Custom domains > Add `moments.yourdomain.com`.

## Security checklist

- [x] Author mutations require JWT (Moments session token)
- [x] Unique constraint on (post_id, visitor_id) prevents duplicate likes
- [x] Image upload validates MIME type + size (8MB max)
- [x] Rate limiting on like endpoints (10/min per IP, falls back to in-memory)
- [x] Parameterized D1 queries (no raw SQL from user input)
- [x] Secrets never committed; D1/R2 accessed only from the Worker
