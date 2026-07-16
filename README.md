# Moments

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/violet27chen/cloudflare_pyq" target="_blank" rel="noopener">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</p>

A single-author public moments feed. Only the author posts; everyone can read and like.

Built entirely on Cloudflare: a single Worker serves the API, the built frontend (Static Assets), and images — backed by **D1** (SQLite) for data, **R2** for image storage, and password-based admin auth. No external database or auth provider required.

## Quick start

```bash
# Install dependencies
pnpm install

# Start frontend dev server (port 4321)
pnpm dev

# Start Worker dev server (port 8787, needs .dev.vars)
pnpm dev:worker
```

## Deploy

The **Deploy to Cloudflare** button at the top starts Cloudflare's deploy flow. Because this is a monorepo (the Worker lives in `worker/`), a clean deploy is usually done from the CLI:

```bash
# 1. Clone & install
git clone https://github.com/violet27chen/cloudflare_pyq
cd cloudflare_pyq && pnpm install

# 2. Create Cloudflare resources
wrangler d1 create moments              # copy the returned database_id into worker/wrangler.toml
wrangler r2 bucket create moments-images

# 3. Set secrets (never commit these)
wrangler secret put ADMIN_JWT_SECRET --name moments-api   # e.g. openssl rand -hex 32
wrangler secret put ADMIN_PASSWORD --name moments-api     # your admin login password

# 4. Apply schema + seed to the REMOTE D1 database
cd worker
wrangler d1 execute moments --remote --file=./db/schema.sql
wrangler d1 execute moments --remote --file=./db/seed.sql

# 5. Deploy (builds frontend, then deploys the Worker)
pnpm deploy
```

Open `https://<your-subdomain>.workers.dev` — the feed is at `/`, the author panel at `/admin` (log in with `ADMIN_PASSWORD`).

## Project structure

```
frontend/          Astro + React + Tailwind v4 (static build -> worker serves it)
  src/
    pages/         index.astro (feed), admin.astro (author panel)
    components/    Feed, PostCard, LikeButton, ImageGrid, Admin, PostSkeleton
    layouts/       BaseLayout.astro
    hooks/         useVisitorId
    utils/         api, config, time
    styles/        global.css (design tokens)

worker/            Cloudflare Worker (Hono) — API + serves frontend via Static Assets
  src/
    index.ts       app entry, middleware, route mounts
    routes/        posts, auth, upload, stats, images
    middleware/    cors, auth (JWT), rateLimit, error
    utils/         jwt, validate, response
  db/
    schema.sql     D1 tables, indexes, triggers
    seed.sql       sample data

r2/                Images in the moments-images bucket (served same-origin via /img/*)
```

## Documentation

- [Deployment guide](./DEPLOY.md) - Cloudflare-only deployment (D1 + R2 + password auth)

## Design

Apple-style minimal social timeline. Warm monochrome palette, single rose accent, Geist typography, soft shadows, glass header, smooth micro-animations. Mobile-first, responsive, dark mode support.
