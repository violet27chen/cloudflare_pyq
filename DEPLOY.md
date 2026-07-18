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

点 README 顶部按钮即进入 Cloudflare 网页部署引导（**无需在终端敲命令**）。引导会关联你的 GitHub 仓库并创建 Git 关联的 Worker（Workers Builds），之后每次 `git push` 到 `main` 都会自动重新部署。

**关键**：引导里的 Deploy command 默认是 `wrangler deploy`，必须改成 **`pnpm deploy`**（只有 `scripts/deploy.mjs` 才会自动建 D1/R2、应用迁移、首次生成密码）。Build command 填 `pnpm build:frontend`（可选，因为 `pnpm deploy` 内部也会构建前端）。

> ⚠️ Cloudflare 自动生成的构建令牌可能不含 **D1 / R2 / Secrets 写权限**。若 `wrangler d1 create` / `wrangler r2 bucket create` / `wrangler secret put` 报权限错误，请在构建设置的 API Token 处填入具备 **D1:Edit、R2:Edit、Workers Scripts:Edit、Secrets:Edit** 的令牌。
>
> 部署引导的 **Environment variables** 步骤会预填 `ADMIN_PASSWORD` 与 `ADMIN_JWT_SECRET` 两个密钥名：留空即由部署脚本自动生成，也可直接填入你自己的值。

## Manual deploy

```bash
git clone https://github.com/violet27chen/cloudflare_pyq
cd cloudflare_pyq && pnpm install
pnpm deploy          # 构建前端 + 自动建 D1/R2 + 应用迁移 + 首次生成密码 + 部署
```

`pnpm deploy` 调用 `scripts/deploy.mjs`，它会：

- D1 `moments` 不存在则创建，并把 id 写回 `wrangler.toml`；
- R2 `moments-images` 不存在则创建；
- `wrangler d1 migrations apply moments --remote` 应用迁移；
- `ADMIN_JWT_SECRET` / `ADMIN_PASSWORD` **仅在缺失时**随机生成（部署日志打印 `ADMIN_PASSWORD`），已存在则跳过，重部署不覆盖。

如需完全手动（不使用脚本）：

```bash
wrangler d1 create moments
wrangler r2 bucket create moments-images
wrangler secret put ADMIN_JWT_SECRET --name moments-api   # e.g. openssl rand -hex 32
wrangler secret put ADMIN_PASSWORD --name moments-api     # 你的后台登录密码
cd worker
wrangler d1 execute moments --remote --file=./db/schema.sql
wrangler d1 execute moments --remote --file=./db/seed.sql
pnpm build:frontend && wrangler deploy
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
