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

### 一键部署（Deploy to Cloudflare 按钮）

点顶部 **Deploy to Cloudflare** 按钮，会进入 Cloudflare 的网页部署引导（**不需要在终端敲命令**）。引导会：

- 把仓库关联到你的 GitHub 账户，并创建 **Git 关联的 Worker（Workers Builds）**——配置完成后，**每次 `git push` 到 `main` 都会自动重新构建并部署**；
- 让你确认构建 / 部署命令。默认命令是 `wrangler deploy`，但本项目需要先用 `scripts/deploy.mjs` 自动建库/建桶，**请按下表设置**，否则默认命令会因还没有 D1/R2 而失败。

| 引导里的设置 | 填的值 |
| --- | --- |
| Build command（可选） | `pnpm build:frontend` |
| Deploy command | `pnpm deploy` |

`pnpm deploy` 依次完成：构建前端 → 自动创建 D1 库 `moments`（并把 id 写回 `wrangler.toml`）→ 自动创建 R2 桶 `moments-images` → 应用数据库迁移 → **仅在缺失时**随机生成 `ADMIN_PASSWORD` 与 `ADMIN_JWT_SECRET`（已存在则跳过，重部署不覆盖）→ `wrangler deploy`。生成的 `ADMIN_PASSWORD` 会打印在构建日志里，用它登录 `/admin`。

> ⚠️ **权限注意**：Cloudflare 自动生成的构建令牌默认可能**不包含 D1 / R2 / Secrets 写权限**，分别导致 `wrangler d1 create`、`wrangler r2 bucket create`、`wrangler secret put` 报权限错误。若遇到，请在部署设置的 API Token 处填入你自建的令牌，权限需包含 **D1:Edit、R2:Edit、Workers Scripts:Edit、Secrets:Edit**（或直接用账户级“编辑”令牌）。
>
> 部署引导的 **Environment variables（环境变量）** 步骤现在会预填 `ADMIN_PASSWORD` 与 `ADMIN_JWT_SECRET` 两个密钥名：留空即可由部署脚本自动生成（密码打印在构建日志），也可直接填入你自己的值（推荐给后台设一个强密码）。

### 手动部署（等价）

```bash
git clone https://github.com/violet27chen/cloudflare_pyq
cd cloudflare_pyq && pnpm install
pnpm deploy          # 构建前端 + 自动建库/桶/迁移/密钥 + 部署
```

打开 `https://<your-subdomain>.workers.dev`：feed 在 `/`，后台在 `/admin`（用日志里打印的密码登录）。

### 自定义域名（可选）

取消 `wrangler.toml` 末尾 `[[routes]]` 注释、改成你的域名并重新 `pnpm deploy`（该域名的 zone 必须在 Cloudflare 上，部署时会自动建 DNS + TLS）。也可在 Worker 控制台的 Triggers > Custom Domains 里手动添加。

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
