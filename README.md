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

点顶部 **Deploy to Cloudflare** 按钮即可一键部署：仓库会被 fork 到你自己的 Cloudflare 账户，使用 `*.workers.dev` 子域。首次部署由 `scripts/deploy.mjs` **自动完成**以下步骤，无需手动操作：

1. 创建 D1 数据库 `moments`，并把 id 写回 `wrangler.toml`；
2. 创建 R2 存储桶 `moments-images`；
3. 应用数据库迁移（`wrangler d1 migrations apply`）；
4. 随机生成后台密码 `ADMIN_PASSWORD` 与 `ADMIN_JWT_SECRET`（**仅当未设置时**才生成，重部署不会覆盖已有密码）。

部署日志里会打印生成的 `ADMIN_PASSWORD`，用它登录 `/admin`。

手动部署（等价）：

```bash
git clone https://github.com/violet27chen/cloudflare_pyq
cd cloudflare_pyq && pnpm install
pnpm deploy          # 构建前端 + 自动建库/桶/迁移/密钥 + 部署
```

打开 `https://<your-subdomain>.workers.dev`：feed 在 `/`，后台在 `/admin`（用日志里打印的密码登录）。

### 自定义域名（可选）

取消 `wrangler.toml` 末尾 `[[routes]]` 注释、改成你的域名并重新 `pnpm deploy`（该域名的 zone 必须在 Cloudflare 上，部署时会自动建 DNS + TLS）。

## Project structure

```
frontend/          Astro + React + Tailwind v4 (static build -> worker serves it)
  src/
    pages/         index.astro (feed), admin.astro (author panel)
    components/    Feed, PostCard, LikeButton, ImageGrid, Admin, ProfileHeader, PostSkeleton
    layouts/       BaseLayout.astro
    hooks/         useVisitorId
    utils/         api, config, time
    styles/        global.css (design tokens)

worker/            Cloudflare Worker (Hono) — API + serves frontend via Static Assets
  src/
    index.ts       app entry, middleware, route mounts
    routes/        posts, auth, upload, stats, images, profile
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

微信朋友圈风格的单作者动态页。浅灰页面背景 + 白色卡片（靠底色分层，不用大阴影/毛玻璃），中文系统字体，小圆角；点赞用微信红、主按钮与链接用微信绿。无入场动画与浮夸特效，九宫格图片布局；移动端单列、桌面端主 feed + 左右两列。支持暗色模式。
