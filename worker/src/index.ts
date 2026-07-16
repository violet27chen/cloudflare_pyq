import { Hono } from 'hono';
import type { Env, AppVariables, ApiResponse } from './types';
import { cors } from './middleware/cors';
import { onError } from './middleware/error';
import { posts } from './routes/posts';
import { auth } from './routes/auth';
import { upload } from './routes/upload';
import { stats } from './routes/stats';

/**
 * Moments API - Cloudflare Worker.
 *
 * All routes live under /api. Reads (feed, single post) and likes are
 * public; mutations (create/edit/delete/upload) require the author
 * session token, applied per-route via the requireAuthor middleware.
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

// --- route mounts (internals filled in stages 4-6) ----------------------
app.route('/api/posts', posts);
app.route('/api/auth', auth);
app.route('/api/upload', upload);
app.route('/api/stats', stats);

export default app;
