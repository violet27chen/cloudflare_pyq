'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  exchangeSession,
  createPost,
  editPost,
  deletePost,
  uploadImage,
  fetchPosts,
  type PostDTO,
} from '../utils/api';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../utils/config';
import { formatRelative } from '../utils/time';

/**
 * Admin panel - hidden at /admin.
 *
 * Flow:
 *   1. Author enters email + password (Supabase Auth).
 *   2. Supabase returns an access_token.
 *   3. Frontend exchanges it for a Moments session token via /api/auth/session.
 *   4. All mutations use the Moments token (Authorization: Bearer).
 *
 * The panel is intentionally minimal - not a CMS. Just: compose, publish,
 * edit, delete, and a small stats strip.
 */

interface AdminState {
  supabase: SupabaseClient | null;
  sessionToken: string | null;
  email: string;
  password: string;
  loading: boolean;
  error: string | null;
}

export function Admin() {
  const reduce = useReducedMotion();
  const [state, setState] = useState<AdminState>({
    supabase: null,
    sessionToken: null,
    email: '',
    password: '',
    loading: false,
    error: null,
  });

  // Initialize Supabase client on mount.
  useEffect(() => {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      setState((s) => ({ ...s, supabase: client }));
    }
  }, []);

  // Check for existing session on mount.
  useEffect(() => {
    const stored = sessionStorage.getItem('moments_admin_token');
    if (stored) {
      setState((s) => ({ ...s, sessionToken: stored }));
    }
  }, []);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.supabase) return;
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const { data, error } = await state.supabase.auth.signInWithPassword({
        email: state.email,
        password: state.password,
      });
      if (error) throw error;
      if (!data.session) throw new Error('No session returned.');

      // Exchange Supabase token for Moments session token.
      const { token } = await exchangeSession(data.session.access_token);
      sessionStorage.setItem('moments_admin_token', token);
      setState((s) => ({ ...s, sessionToken: token, loading: false }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Login failed.',
      }));
    }
  }, [state.supabase, state.email, state.password]);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem('moments_admin_token');
    setState((s) => ({ ...s, sessionToken: null, email: '', password: '' }));
  }, []);

  // --- Login form ---
  if (!state.sessionToken) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-[400px] flex-col items-center justify-center px-6">
        <motion.div
          className="m-card w-full p-8"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1
            className="text-xl font-semibold tracking-tight"
            style={{ color: 'var(--fg)' }}
          >
            Author sign in
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--fg-muted)' }}>
            Moments admin
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="admin-email"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: 'var(--fg)' }}
              >
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                required
                value={state.email}
                onChange={(e) =>
                  setState((s) => ({ ...s, email: e.target.value }))
                }
                className="w-full rounded-xl border px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-[var(--color-accent)]"
                style={{
                  backgroundColor: 'var(--color-surface-2)',
                  borderColor: 'var(--line)',
                  color: 'var(--fg)',
                }}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label
                htmlFor="admin-password"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: 'var(--fg)' }}
              >
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                required
                value={state.password}
                onChange={(e) =>
                  setState((s) => ({ ...s, password: e.target.value }))
                }
                className="w-full rounded-xl border px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-[var(--color-accent)]"
                style={{
                  backgroundColor: 'var(--color-surface-2)',
                  borderColor: 'var(--line)',
                  color: 'var(--fg)',
                }}
                placeholder="••••••••"
              />
            </div>

            {state.error && (
              <p className="text-sm" style={{ color: 'var(--color-accent)' }}>
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={state.loading}
              className="m-btn-primary w-full py-2.5 text-[15px] disabled:opacity-50"
            >
              {state.loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // --- Admin dashboard ---
  return (
    <AdminDashboard
      token={state.sessionToken}
      onLogout={handleLogout}
    />
  );
}

/* ============================================================
 * Dashboard (after login)
 * ============================================================ */

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

function AdminDashboard({ token, onLogout }: DashboardProps) {
  const reduce = useReducedMotion();
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    total_posts: number;
    total_likes: number;
  } | null>(null);

  // Compose state.
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Load posts + stats.
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [postsRes, statsRes] = await Promise.all([
        fetchPosts({ limit: 50, visitorId: null }),
        fetch(`${import.meta.env.PUBLIC_API_BASE ?? ''}/api/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.json()),
      ]);
      setPosts(postsRes.items);
      if (statsRes.ok) setStats(statsRes.data);
    } catch {
      // Silently fail; user can refresh.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Image upload handler.
  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          const { url } = await uploadImage(token, file);
          setImages((prev) => [...prev, url]);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Upload failed.');
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    },
    [token],
  );

  // Publish / update handler.
  const handlePublish = useCallback(async () => {
    if (!content.trim()) return;
    setPublishing(true);
    try {
      if (editingId) {
        await editPost(token, editingId, { content, image_urls: images });
      } else {
        await createPost(token, { content, image_urls: images });
      }
      setContent('');
      setImages([]);
      setEditingId(null);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Publish failed.');
    } finally {
      setPublishing(false);
    }
  }, [token, content, images, editingId, loadData]);

  // Edit handler.
  const handleEdit = useCallback((post: PostDTO) => {
    setEditingId(post.id);
    setContent(post.content);
    setImages(post.images);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Delete handler.
  const handleDelete = useCallback(
    async (postId: string) => {
      if (!confirm('Delete this post? This cannot be undone.')) return;
      try {
        await deletePost(token, postId);
        await loadData();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Delete failed.');
      }
    },
    [token, loadData],
  );

  return (
    <div className="mx-auto max-w-[640px] px-4 pb-16 pt-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1
          className="text-xl font-semibold tracking-tight"
          style={{ color: 'var(--fg)' }}
        >
          Moments
        </h1>
        <button
          type="button"
          onClick={onLogout}
          className="text-sm transition-colors"
          style={{ color: 'var(--fg-muted)' }}
        >
          Sign out
        </button>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="m-card mb-6 flex divide-x p-4" style={{ borderColor: 'var(--line)' }}>
          <div className="flex-1 text-center">
            <div className="text-2xl font-semibold" style={{ color: 'var(--fg)' }}>
              {stats.total_posts}
            </div>
            <div className="m-meta mt-0.5">posts</div>
          </div>
          <div className="flex-1 text-center" style={{ borderColor: 'var(--line)' }}>
            <div className="text-2xl font-semibold" style={{ color: 'var(--color-accent)' }}>
              {stats.total_likes}
            </div>
            <div className="m-meta mt-0.5">likes</div>
          </div>
        </div>
      )}

      {/* Compose card */}
      <motion.div
        className="m-card mb-8 p-5"
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind?"
          rows={4}
          maxLength={5000}
          className="w-full resize-none rounded-xl border p-3.5 text-[15px] leading-relaxed outline-none transition-colors focus:border-[var(--color-accent)]"
          style={{
            backgroundColor: 'var(--color-surface-2)',
            borderColor: 'var(--line)',
            color: 'var(--fg)',
          }}
        />

        {/* Image previews */}
        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {images.map((url, i) => (
              <div key={url} className="group relative aspect-square overflow-hidden rounded-lg">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center justify-between">
          <label
            className="flex cursor-pointer items-center gap-1.5 text-sm transition-colors"
            style={{ color: 'var(--fg-muted)' }}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleImageUpload}
              className="hidden"
              disabled={uploading}
            />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            {uploading ? 'Uploading...' : 'Add photos'}
          </label>

          <div className="flex items-center gap-3">
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setContent('');
                  setImages([]);
                }}
                className="text-sm"
                style={{ color: 'var(--fg-muted)' }}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing || !content.trim()}
              className="m-btn-primary px-5 py-2 text-sm disabled:opacity-50"
            >
              {publishing
                ? 'Publishing...'
                : editingId
                  ? 'Update'
                  : 'Publish'}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Post history */}
      <div className="space-y-3">
        <h2 className="m-meta mb-2">Recent posts</h2>
        {loading ? (
          <div className="m-card p-6 text-center">
            <span className="m-meta">Loading...</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="m-card p-6 text-center">
            <span className="m-meta">No posts yet</span>
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="m-card flex items-start gap-3 p-4"
            >
              <div className="min-w-0 flex-1">
                <p
                  className="line-clamp-2 text-[15px] leading-relaxed"
                  style={{ color: 'var(--fg)' }}
                >
                  {post.content}
                </p>
                <div className="m-meta mt-1.5 flex items-center gap-3">
                  <span>{formatRelative(post.created_at)}</span>
                  <span>{post.like_count} likes</span>
                  {post.images.length > 0 && (
                    <span>{post.images.length} photos</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => handleEdit(post)}
                  className="rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(post.id)}
                  className="rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--color-accent-soft)]"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
