# Supabase Setup

The data layer for Moments. ~10 minutes total.

## 1. Create the project

1. https://supabase.com → New project. Note the region closest to your
   Cloudflare Worker edge (Workers run globally; pick the same region
   for lowest read latency).
2. Set a strong database password. Save it somewhere safe.

## 2. Run the schema

Open **SQL Editor** → New query → paste the contents of
[`schema.sql`](./schema.sql) → **Run**. It is idempotent; re-running is safe.

This creates:
- `posts`, `post_images`, `likes` tables
- the unique constraint `(post_id, visitor_id)` preventing duplicate likes
- indexes for the read paths
- the `updated_at` trigger
- the `post_stats` aggregate view
- **RLS**: public read on all tables, **no write policies** (so anon/auth
  keys cannot mutate data; only the service_role key used by the Worker can)
- a public-read Storage bucket `post-images`

## 3. (Optional) Seed for local dev

Run [`seed.sql`](./seed.sql) the same way. It inserts 5 sample posts with
picsum images and a few likes, and prints a verification table.

## 4. Create the author account (Supabase Auth)

**Authentication → Users → Add user**:
- email: your address
- password: strong
- **Auto Confirm User: ON** (so login works immediately without email flow)

This is the *only* user. There is no public sign-up.

## 5. Collect credentials for the Worker

From **Project Settings → API**:

| Secret | Where | Used for |
|---|---|---|
| `SUPABASE_URL` | Project URL | Worker → PostgREST / Storage |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` secret | Worker writes (bypasses RLS) |
| `ADMIN_JWT_SECRET` | you generate (see below) | signing author session tokens |
| `STORAGE_BUCKET` | literal `post-images` | image uploads |

The `anon` key is **public** and safe to expose in the frontend
(`PUBLIC_SUPABASE_ANON_KEY`). It can only read, because of RLS.

Generate a JWT secret for author sessions:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set all four Worker secrets:

```bash
cd worker
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put ADMIN_JWT_SECRET
wrangler secret put STORAGE_BUCKET   # value: post-images
```

## 6. Verify RLS is doing its job

From the SQL editor, as the anon role is not directly available here, the
practical test is the Worker: with only the `anon` key, an insert into
`posts` must fail. The Worker uses `service_role`, so it succeeds.

## Storage notes

- Bucket `post-images` is **public read** (the feed needs to render images
  to anonymous visitors) but **service-role write only** (uploads go through
  the Worker, which enforces type/size limits and author JWT).
- Image MIME and size limits are enforced in the Worker (`/api/upload`),
  not just here, so a malicious direct Storage call still needs the
  service key.
