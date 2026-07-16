'use client';

import { motion, useReducedMotion } from 'motion/react';
import { ImageGrid } from './ImageGrid';
import { LikeButton } from './LikeButton';
import { formatRelative } from '../utils/time';
import { AUTHOR_NAME } from '../utils/config';
import type { PostDTO } from '../utils/api';

/**
 * A single post card in the feed.
 *
 * Layout (top to bottom):
 *   [avatar] [author name]                    [timestamp]
 *   content text
 *   [image grid]
 *   [like button] [like count]
 *
 * Enters with a subtle fade-up on scroll (whileInView).
 */

interface PostCardProps {
  post: PostDTO;
  visitorId: string;
  index: number;
}

export function PostCard({ post, visitorId, index }: PostCardProps) {
  const reduce = useReducedMotion();

  return (
    <motion.article
      className="m-card overflow-hidden"
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{
        duration: 0.5,
        delay: index * 0.06,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <div className="p-5 sm:p-6">
        {/* Header: avatar + name + timestamp */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            style={{
              backgroundColor: 'var(--color-surface-2)',
              color: 'var(--fg)',
              border: '1px solid var(--line)',
            }}
          >
            {AUTHOR_NAME.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-[15px] font-medium"
              style={{ color: 'var(--fg)' }}
            >
              {AUTHOR_NAME}
            </div>
          </div>
          <time
            dateTime={post.created_at}
            className="m-meta shrink-0"
          >
            {formatRelative(post.created_at)}
          </time>
        </div>

        {/* Content */}
        <p
          className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed"
          style={{ color: 'var(--fg)', maxWidth: '65ch' }}
        >
          {post.content}
        </p>

        {/* Images */}
        <ImageGrid images={post.images} />

        {/* Footer: like button */}
        <div className="mt-4 flex items-center">
          <LikeButton
            postId={post.id}
            initialLiked={post.liked}
            initialCount={post.like_count}
            visitorId={visitorId}
          />
        </div>
      </div>
    </motion.article>
  );
}
