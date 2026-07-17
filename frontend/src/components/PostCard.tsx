'use client';

import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { ImageGrid } from './ImageGrid';
import { LikeButton } from './LikeButton';
import { formatRelative } from '../utils/time';
import type { PostDTO } from '../utils/api';

interface PostCardProps {
  post: PostDTO;
  visitorId: string;
  index: number;
  /** 来自全局 profile 的作者信息（编辑个人信息后自动同步） */
  authorName?: string;
  authorAvatar?: string;
}

export function PostCard({ post, visitorId, index, authorName, authorAvatar }: PostCardProps) {
  return (
    <article className="m-card overflow-hidden">
      <div className="p-5 sm:p-6">
        {/* Header: avatar + name + timestamp */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold"
            style={{
              backgroundColor: 'var(--color-surface-2)',
              color: 'var(--fg)',
              border: '1px solid var(--line)',
            }}
          >
            {authorAvatar ? (
              <img src={authorAvatar} alt="" className="h-full w-full object-cover" />
            ) : (
              (authorName ? authorName.charAt(0) : '')
            )}
          </div>
          <div className="min-w-0 flex-1">
            {authorName ? (
              <div
                className="truncate text-[15px] font-medium"
                style={{ color: 'var(--fg)' }}
              >
                {authorName}
              </div>
            ) : (
              <div
                className="h-4 w-24 rounded"
                style={{ backgroundColor: 'var(--color-surface-2)' }}
              />
            )}
          </div>
          <time
            dateTime={post.created_at}
            className="m-meta shrink-0"
          >
            {formatRelative(post.created_at)}
          </time>
        </div>

        {/* Content — 支持 Markdown 渲染 */}
        <div
          className="mt-4 text-[15px] leading-relaxed prose-headings:font-semibold prose-headings:text-[var(--fg)] prose-p:text-[var(--fg)] prose-a:text-[var(--color-accent)] prose-a:no-underline hover:prose-a:underline prose-strong:text-[var(--fg)] prose-code:text-[var(--fg-soft)] prose-code:bg-[var(--card-2)] prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-li:text-[var(--fg)] prose-blockquote:border-l-[var(--color-accent)] prose-blockquote:text-[var(--fg-muted)]"
          style={{ color: 'var(--fg)', maxWidth: '65ch' }}
        >
          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
            {post.content}
          </ReactMarkdown>
        </div>

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
    </article>
  );
}
