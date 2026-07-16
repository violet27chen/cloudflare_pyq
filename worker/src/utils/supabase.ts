import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../types';

/**
 * Per-request, memoized Supabase service-role client.
 *
 * The service_role key bypasses RLS, which is why ALL writes go through
 * the Worker and never through the anon key exposed to the browser.
 *
 * Workers may reuse env across requests, but constructing a client per
 * request is cheap and avoids shared mutable state. Callers receive the
 * same instance within a single request via the context var.
 */
export function createServiceClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      // The Worker does not use Supabase Auth sessions; it validates the
      // author's Supabase JWT itself, then signs its own short-lived token.
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: { 'x-client-info': 'moments-worker' },
    },
  });
}
