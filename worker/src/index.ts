import { Hono } from 'hono';
import type { Env, AppVariables, ApiResponse } from './types';
import { cors } from './middleware/cors';
import { onError } from './middleware/error';
import { posts } from './routes/posts';
import { auth } from './routes/auth';
import { upload } from './routes/upload';
import { stats } from './routes/stats';
import { images } from './routes/images';

/**
 * Moments API + static frontend - single Cloudflare Worker.
 *
 * /api/*  -> Hono app (D1-backed API)
 * /img/*  -> Hono app (R2 image serving)
 * everything else -> ASSETS binding (built frontend/dist)
 */
const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Global middleware: CORS first (handles OPTIONS), then error boundary.
app.use('*', cors);
app.onError(onError);

// --- health -------------------------------------------------------------
app.get('/api/health', (c) => {
  const body: ApiResponse<{ status: string; env: string; time: string }> = {
    ok: true,
    data: {
      status: 'ok',
      env: c.env.ENVIRONMENT,
      time: new Date().toISOString(),
    },
  };
  return c.json(body);
});

// --- route mounts --------------------------------------------------------
app.route('/api/posts', posts);
app.route('/api/auth', auth);
app.route('/api/upload', upload);
app.route('/api/stats', stats);
app.route('/img', images);

// Serve the built frontend for all non-API, non-image paths.
app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/img/')) {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
