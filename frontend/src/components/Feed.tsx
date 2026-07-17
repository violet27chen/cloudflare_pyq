'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PostCard } from './PostCard';
import { ProfileHeader } from './ProfileHeader';
import { BackgroundMedia } from './BackgroundMedia';
import { NoteBlank } from '@phosphor-icons/react';
import { FeedSkeleton } from './PostSkeleton';
import { useVisitorId } from '../hooks/useVisitorId';
import {
  fetchPosts,
  getProfile,
  getSettings,
  type PostDTO,
  type ProfileDTO,
  type SidebarItemDTO,
  type SiteSettingsDTO,
} from '../utils/api';

const PAGE_SIZE = 10;

export function Feed() {
  const visitorId = useVisitorId();
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [sidebarItems, setSidebarItems] = useState<SidebarItemDTO[]>([]);
  const [settings, setSettings] = useState<SiteSettingsDTO | null>(null);
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

  // Load sidebar items
  useEffect(() => {
    fetch('/api/sidebar')
      .then((r) => r.json())
      .then((body) => {
        if (body.ok) setSidebarItems(body.data ?? []);
      })
      .catch(() => {});
  }, []);

  // Load site settings (interface background)
  useEffect(() => {
    getSettings()
      .then(setSettings)
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
      setError(err instanceof Error ? err.message : '加载动态失败');
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

  // Author info for post cards (synced from profile).
  // 注意：加载完成前保持空字符串，避免闪现占位名 "L."。
  const authorName = profile?.display_name ?? '';
  const authorAvatar = profile?.avatar_url ?? undefined;

  // Split sidebar items by column placement.
  const leftItems = sidebarItems.filter((i) => i.placement === 'left');
  const rightItems = sidebarItems.filter((i) => i.placement === 'right');
  const mainItems = sidebarItems.filter((i) => i.placement === 'main');

  // Full-page background layer (image or video).
  const bgLayer =
    settings && settings.bg_type !== 'none' && settings.bg_url ? (
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <BackgroundMedia settings={settings} />
      </div>
    ) : null;

  // --- Render states ---

  if (loading) {
    return (
      <>
        {bgLayer}
        <FeedSkeleton count={3} />
      </>
    );
  }

  if (error) {
    return (
      <>
        {bgLayer}
        <div className="m-card p-8 text-center">
          <p className="text-[15px]" style={{ color: 'var(--fg-muted)' }}>
            {error}
          </p>
          <button
            type="button"
            onClick={loadInitial}
            className="m-btn-primary mt-4 px-5 py-2 text-sm"
          >
            重试
          </button>
        </div>
      </>
    );
  }

  // 主内容区：无动态时显示空状态卡片；有动态时显示列表
  const feedBody =
    posts.length === 0 ? (
      <div className="m-card p-12 text-center">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            backgroundColor: 'var(--color-surface-2)',
            border: '1px solid var(--line)',
          }}
        >
          <NoteBlank size={24} weight="regular" style={{ color: 'var(--fg-muted)' }} />
        </div>
        <p
          className="mt-4 text-[15px] font-medium"
          style={{ color: 'var(--fg)' }}
        >
          还没有动态
        </p>
        <p
          className="mt-1 text-sm"
          style={{ color: 'var(--fg-muted)' }}
        >
          作者还没有分享任何内容，稍后再来看看吧~
        </p>
      </div>
    ) : (
      <>
        {posts.map((post, i) => (
          <PostCard
            key={post.id}
            post={post}
            visitorId={visitorId}
            index={i}
            authorName={authorName}
            authorAvatar={authorAvatar}
          />
        ))}

        {/* Infinite scroll sentinel */}
        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-6">
            {loadingMore && (
              <div className="flex items-center gap-2">
                <div className="m-skeleton h-4 w-4 rounded-full" />
                <span className="m-meta">加载更多...</span>
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
            <p className="m-meta mt-4">已经到底啦</p>
          </div>
        )}
      </>
    );

  return (
    <>
      {bgLayer}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* 左侧列 — 仅桌面端显示 */}
        {leftItems.length > 0 && (
          <aside className="hidden w-72 shrink-0 space-y-4 lg:block">
            {leftItems.map((item) => (
              <SidebarCard key={item.id} item={item} />
            ))}
          </aside>
        )}

        {/* 主内容区 — 中间列：封面 + 主区域内容 + 动态列表 */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* 个人主页头部（朋友圈风格）— 无论有无动态都先显示封面区域 */}
          {profile && <ProfileHeader profile={profile} />}

          {/* 中间主区域内容（admin 可在后台编辑） */}
          {mainItems.map((item) => (
            <SidebarCard key={item.id} item={item} />
          ))}

          {feedBody}
        </div>

        {/* 右侧列 — 仅桌面端显示 */}
        {rightItems.length > 0 && (
          <aside className="hidden w-72 shrink-0 space-y-4 lg:block">
            {rightItems.map((item) => (
              <SidebarCard key={item.id} item={item} />
            ))}
          </aside>
        )}
      </div>
    </>
  );
}

/* ---------- Sidebar card component ---------- */

function SidebarCard({ item }: { item: SidebarItemDTO }) {
  if (item.type === 'image') {
    return (
      <div className="m-card overflow-hidden">
        <img
          src={item.content}
          alt={item.title || ''}
          className="h-auto w-full object-cover"
        />
        {item.title && (
          <div className="p-3">
            <p className="text-sm font-medium" style={{ color: 'var(--fg)' }}>
              {item.title}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (item.type === 'markdown') {
    return (
      <div className="m-card p-5">
        {item.title && (
          <h3
            className="mb-2 text-sm font-semibold"
            style={{ color: 'var(--fg)' }}
          >
            {item.title}
          </h3>
        )}
        <div
          className="text-sm leading-relaxed prose-headings:font-semibold prose-p:text-[var(--fg-soft)] prose-a:text-[var(--color-accent)]"
          style={{ color: 'var(--fg-soft)' }}
        >
          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
            {item.content}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  /* text (default) */
  return (
    <div className="m-card p-5">
      {item.title && (
        <h3
          className="mb-2 text-sm font-semibold"
          style={{ color: 'var(--fg)' }}
        >
          {item.title}
        </h3>
      )}
      <p
        className="whitespace-pre-wrap text-sm leading-relaxed"
        style={{ color: 'var(--fg-soft)' }}
      >
        {item.content}
      </p>
    </div>
  );
}

// Lazy import ReactMarkdown for sidebar markdown rendering
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
