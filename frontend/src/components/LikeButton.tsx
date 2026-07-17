'use client';

import { useState, useCallback, useRef } from 'react';
import { Heart } from '@phosphor-icons/react';
import { likePost, unlikePost } from '../utils/api';

/**
 * 微信式点赞：红心 + 「赞」文字 + 计数。
 * 乐观更新，失败后回滚。无粒子爆发等浮夸动画。
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
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const pendingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = useCallback(async () => {
    if (!visitorId || pendingRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      pendingRef.current = true;
      const wasLiked = liked;
      const wasCount = count;

      // 乐观更新
      const nextLiked = !wasLiked;
      const nextCount = wasLiked ? wasCount - 1 : wasCount + 1;
      setLiked(nextLiked);
      setCount(nextCount);

      try {
        const res = nextLiked
          ? await likePost(postId, visitorId)
          : await unlikePost(postId, visitorId);
        setLiked(res.liked);
        setCount(res.like_count);
      } catch {
        setLiked(wasLiked);
        setCount(wasCount);
      } finally {
        pendingRef.current = false;
      }
    }, 200);
  }, [postId, visitorId, liked, count]);

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center gap-1.5 rounded-[4px] px-2 py-1 transition-colors active:scale-95"
      aria-label={liked ? '取消赞' : '赞'}
      aria-pressed={liked}
    >
      <Heart
        size={18}
        weight={liked ? 'fill' : 'regular'}
        className={liked ? 'text-[var(--color-like)]' : 'text-[var(--fg-muted)]'}
      />
      <span
        className={`text-sm ${liked ? 'text-[var(--color-like)]' : 'text-[var(--fg-muted)]'}`}
      >
        赞{count > 0 ? ` ${count}` : ''}
      </span>
    </button>
  );
}
