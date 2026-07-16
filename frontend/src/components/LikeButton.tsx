'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'motion/react';
import { Heart } from '@phosphor-icons/react';
import { likePost, unlikePost } from '../utils/api';

/**
 * Like button with optimistic update + burst animation.
 *
 * Behavior:
 *   - Click toggles like/unlike.
 *   - Optimistic: UI updates immediately, then syncs with server.
 *   - On failure, rolls back to the previous state.
 *   - Burst: heart scales up + particles fly out on like.
 *   - Debounced: rapid clicks are coalesced (300ms).
 *
 * Uses Motion's useMotionValue for the burst (no useState re-render loop).
 */

interface LikeButtonProps {
  postId: string;
  initialLiked: boolean;
  initialCount: number;
  visitorId: string;
}

export function LikeButton({
  postId,
  initialLiked,
  initialCount,
  visitorId,
}: LikeButtonProps) {
  const reduce = useReducedMotion();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [burst, setBurst] = useState(false);
  const pendingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = useCallback(async () => {
    if (!visitorId || pendingRef.current) return;

    // Debounce rapid clicks.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      pendingRef.current = true;
      const wasLiked = liked;
      const wasCount = count;

      // Optimistic update.
      const nextLiked = !wasLiked;
      const nextCount = wasLiked ? wasCount - 1 : wasCount + 1;
      setLiked(nextLiked);
      setCount(nextCount);
      if (nextLiked && !reduce) {
        setBurst(true);
        setTimeout(() => setBurst(false), 600);
      }

      try {
        const res = nextLiked
          ? await likePost(postId, visitorId)
          : await unlikePost(postId, visitorId);
        // Sync with server truth.
        setLiked(res.liked);
        setCount(res.like_count);
      } catch {
        // Roll back on failure.
        setLiked(wasLiked);
        setCount(wasCount);
      } finally {
        pendingRef.current = false;
      }
    }, 300);
  }, [postId, visitorId, liked, count, reduce]);

  return (
    <button
      type="button"
      onClick={toggle}
      className="group relative flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors"
      aria-label={liked ? 'Unlike this post' : 'Like this post'}
      aria-pressed={liked}
    >
      {/* Heart icon with burst animation */}
      <span className="relative inline-flex">
        <motion.span
          animate={
            burst && !reduce
              ? { scale: [1, 1.4, 1] }
              : { scale: 1 }
          }
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex"
        >
          <Heart
            size={20}
            weight={liked ? 'fill' : 'regular'}
            className={`transition-colors duration-200 ${
              liked
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--fg-muted)] group-hover:text-[var(--color-accent)]'
            }`}
          />
        </motion.span>

        {/* Particle burst on like */}
        <AnimatePresence>
          {burst && !reduce && (
            <>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <motion.span
                  key={i}
                  className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-[var(--color-accent)]"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{
                    x: Math.cos((i * Math.PI) / 3) * 20,
                    y: Math.sin((i * Math.PI) / 3) * 20,
                    opacity: 0,
                    scale: 0,
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              ))}
            </>
          )}
        </AnimatePresence>
      </span>

      {/* Count */}
      <motion.span
        key={count}
        initial={reduce ? false : { y: -4, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={`m-meta tabular-nums ${
          liked ? 'text-[var(--color-accent)]' : ''
        }`}
      >
        {count}
      </motion.span>
    </button>
  );
}
