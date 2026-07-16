# Moments

A single-author public moments feed. Only the author posts; everyone can read and like.

Built with Astro + React + Tailwind CSS (frontend), Cloudflare Workers (API), and Supabase (PostgreSQL + Storage + Auth).

## Quick start

```bash
# Install dependencies
pnpm install

# Start frontend dev server (port 4321)
pnpm dev

# Start Worker dev server (port 8787, needs .dev.vars)
pnpm dev:worker
```

## Project structure

```
frontend/          Astro + React + Tailwind v4
  src/
    pages/         index.astro (feed), admin.astro (author panel)
    components/    Feed, PostCard, LikeButton, ImageGrid, Admin, PostSkeleton
    layouts/       BaseLayout.astro
    hooks/         useVisitorId
    utils/         api, config, time
    styles/        global.css (design tokens)

worker/            Cloudflare Worker (Hono)
  src/
    index.ts       app entry, middleware, route mounts
    routes/        posts, auth, upload, stats
    middleware/    cors, auth (JWT), rateLimit, error
    utils/         supabase, jwt, validate, response

supabase/          Database schema + seed + setup docs
  schema.sql       tables, indexes, RLS, triggers, views
  seed.sql         sample data for development
  README.md        step-by-step Supabase setup
```

## Documentation

- [Deployment guide](./DEPLOY.md) - full stack deployment
- [Supabase setup](./supabase/README.md) - database + auth + storage

## Design

Apple-style minimal social timeline. Warm monochrome palette, single rose accent, Geist typography, soft shadows, glass header, smooth micro-animations. Mobile-first, responsive, dark mode support.
