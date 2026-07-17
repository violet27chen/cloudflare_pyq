'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PostCard } from './PostCard';
import { FeedSkeleton } from './PostSkeleton';
import { useVisitorId } from '../hooks/useVisitorId';
import { fetchPosts, getProfile, type PostDTO, type ProfileDTO } from '../utils/api';
import { AUTHOR_NAME } from '../utils/config';

/**
 * The main feed island.
 *
 * - Fetches posts with cursor pagination.
 * - Infinite scroll via IntersectionObserver (NOT window scroll listener).
 * - Shows skeleton on first load, inline spinner on subsequent pages.
 * - Empty state when no posts exist.
 * - Error state with retry.
 */

const PAGE_SIZE = 10;

export function Feed() {
  const reduce = useReducedMotion();
  const visitorId = useVisitorId();
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Load the author profile (public).
  useEffect(() => {
    getProfile()
      .then(setProfile)
      .catch(() => {});
  }, []);

  // Initial load.
  const loadInitial = useCallback(async () => {
    if (!visitorId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPosts({ limit: PAGE_SIZE, visitorId });
      setPosts(res.items);
      setCursor(res.next_cursor);
      setHasMore(res.next_cursor !== null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts.');
    } finally {
      setLoading(false);
    }
  }, [visitorId]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Load more (infinite scroll).
  const loadMore = useCallback(async () => {
    if (!visitorId || !cursor || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchPosts({ cursor, limit: PAGE_SIZE, visitorId });
      setPosts((prev) => [...prev, ...res.items]);
      setCursor(res.next_cursor);
      setHasMore(res.next_cursor !== null);
    } catch {
      // Silently fail on scroll-load; user can scroll again to retry.
    } finally {
      setLoadingMore(false);
    }
  }, [visitorId, cursor, loadingMore, hasMore]);

  // IntersectionObserver for infinite scroll.
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' },
    );
    observerRef.current.observe(sentinelRef.current);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [loadMore, hasMore]);

  // --- Render states ---

  if (loading) {
    return <FeedSkeleton count={3} />;
  }

  if (error) {
    return (
      <div className="m-card p-8 text-center">
        <p className="text-[15px]" style={{ color: 'var(--fg-muted)' }}>
          {error}
        </p>
        <button
          type="button"
          onClick={loadInitial}
          className="m-btn-primary mt-4 px-5 py-2 text-sm"
        >
          Try again
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <motion.div
        className="m-card p-12 text-center"
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            backgroundColor: 'var(--color-surface-2)',
            border: '1px solid var(--line)',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--fg-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </div>
        <p
          className="mt-4 text-[15px] font-medium"
          style={{ color: 'var(--fg)' }}
        >
          No posts yet
        </p>
        <p
          className="mt-1 text-sm"
          style={{ color: 'var(--fg-muted)' }}
        >
          The author hasn't shared anything. Check back soon.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Author profile intro */}
      {profile && (
        <div className="m-card flex items-center gap-4 p-5">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-semibold"
            style={{
              backgroundColor: 'var(--color-surface-2)',
              color: 'var(--fg)',
              border: '1px solid var(--line)',
            }}
          >
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              (profile.display_name || AUTHOR_NAME).charAt(0)
            )}
          </div>
          <div className="min-w-0">
            <div
              className="text-lg font-semibold tracking-tight"
              style={{ color: 'var(--fg)' }}
            >
              {profile.display_name || AUTHOR_NAME}
            </div>
            {profile.bio && (
              <p
                className="mt-0.5 text-sm leading-relaxed"
                style={{ color: 'var(--fg-muted)' }}
              >
                {profile.bio}
              </p>
            )}
          </div>
        </div>
      )}

      {posts.map((post, i) => (
        <PostCard
          key={post.id}
          post={post}
          visitorId={visitorId}
          index={i}
        />
      ))}

      {/* Infinite scroll sentinel */}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {loadingMore && (
            <div className="flex items-center gap-2">
              <div className="m-skeleton h-4 w-4 rounded-full" />
              <span className="m-meta">Loading more</span>
            </div>
          )}
        </div>
      )}

      {/* End of feed */}
      {!hasMore && posts.length > 0 && (
        <div className="py-8 text-center">
          <div
            className="mx-auto h-px w-16"
            style={{ backgroundColor: 'var(--line)' }}
          />
          <p className="m-meta mt-4">You've reached the beginning</p>
        </div>
      )}
    </div>
  );
}
