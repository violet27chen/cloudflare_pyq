'use client';

import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { X, CaretLeft, CaretRight, SpeakerSlash } from '@phosphor-icons/react';
import type { MediaItem } from '../utils/api';

/**
 * 微信朋友圈九宫格（支持混合媒体：图片 / 动图 / 视频 / 实况）：
 * - 1 张：原比例小图（最大宽 55%）；视频 / 实况 最大宽 70%。
 * - 2 / 3 / 5-9 张：3 列正方形网格，先满第一行再换行。
 * - 4 张：2x2 正方形网格。
 * - 超过 9 张：显示前 9 张，第 9 格叠加「+N」遮罩，点击查看全部。
 * - 点击任意媒体打开全屏灯箱，支持左右切换（箭头 / ←→ / ESC 关闭）。
 */

interface ImageGridProps {
  media: MediaItem[];
}

const MAX_VISIBLE = 9;

function isVideoLike(item: MediaItem): boolean {
  return item.type === 'video' || item.type === 'live';
}

export function ImageGrid({ media }: ImageGridProps) {
  const [lb, setLb] = useState<{ index: number; list: MediaItem[] } | null>(null);

  useEffect(() => {
    if (!lb) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLb(null);
      if (e.key === 'ArrowLeft') {
        setLb((s) => (s ? { ...s, index: Math.max(0, s.index - 1) } : s));
      }
      if (e.key === 'ArrowRight') {
        setLb((s) => (s ? { ...s, index: Math.min(s.list.length - 1, s.index + 1) } : s));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lb]);

  if (media.length === 0) return null;

  const hasMore = media.length > MAX_VISIBLE;
  const shown = media.slice(0, MAX_VISIBLE);
  const extra = media.length - MAX_VISIBLE;
  const openAt = (i: number) => setLb({ index: i, list: media });

  // 单条：原比例，不裁切
  if (media.length === 1) {
    const item = media[0];
    const wide = isVideoLike(item);
    return (
      <div className="mt-4">
        <div className={`inline-block ${wide ? 'max-w-[70%]' : 'max-w-[55%]'}`}>
          <button
            type="button"
            className="relative block w-full cursor-zoom-in overflow-hidden rounded-[4px]"
            style={{ border: '1px solid var(--line)' }}
            onClick={() => openAt(0)}
            aria-label={item.type === 'video' ? '播放视频' : item.type === 'live' ? '查看实况' : '查看图片'}
          >
            {wide ? (
              <video
                src={item.url}
                poster={item.poster_url}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="block w-full rounded-[4px] object-contain"
                style={{ maxHeight: '80vh' }}
              />
            ) : (
              <img src={item.url} alt="" className="block w-full rounded-[4px] object-cover" />
            )}
            {wide && <MuteBadge />}
            {item.type === 'live' && <LiveBadge />}
          </button>
        </div>

        <Lightbox lb={lb} setLb={setLb} />
      </div>
    );
  }

  const gridClass = media.length === 4 ? 'grid grid-cols-2 gap-1.5' : 'grid grid-cols-3 gap-1.5';

  return (
    <div className="mt-4">
      <div className={gridClass}>
        {shown.map((item, i) => {
          const isMoreBadge = hasMore && i === MAX_VISIBLE - 1;
          return (
            <MediaThumb
              key={`${item.url}-${i}`}
              item={item}
              index={i}
              moreBadge={isMoreBadge ? extra : 0}
              onClick={() => openAt(i)}
            />
          );
        })}
      </div>

      <Lightbox lb={lb} setLb={setLb} />
    </div>
  );
}

/** 网格中的单格（正方形裁切）。 */
function MediaThumb({
  item,
  index,
  moreBadge,
  onClick,
}: {
  item: MediaItem;
  index: number;
  moreBadge: number;
  onClick: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const videoLike = isVideoLike(item);

  return (
    <button
      type="button"
      className="relative aspect-square cursor-zoom-in overflow-hidden rounded-[4px]"
      style={{ border: '1px solid var(--line)' }}
      onClick={onClick}
      aria-label={
        moreBadge > 0
          ? `查看更多，共 ${moreBadge} 个`
          : item.type === 'video'
            ? `播放视频 ${index + 1}`
            : item.type === 'live'
              ? `查看实况 ${index + 1}`
              : `查看图片 ${index + 1}`
      }
    >
      {!loaded && <div className="absolute inset-0 m-skeleton" />}
      {videoLike ? (
        <video
          src={item.url}
          poster={item.poster_url}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setLoaded(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : (
        <img
          src={item.url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {videoLike && <MuteBadge small />}
      {item.type === 'live' && <LiveBadge />}
      {moreBadge > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45">
          <span className="text-lg font-semibold text-white">+{moreBadge}</span>
        </div>
      )}
    </button>
  );
}

/** 静音自动播放角标（右下角，提示这是静音播放的视频）。 */
function MuteBadge({ small }: { small?: boolean }) {
  return (
    <span
      className={`pointer-events-none absolute bottom-1 right-1 flex items-center justify-center rounded bg-black/55 text-white ${small ? 'h-5 w-5' : 'h-6 w-6'}`}
    >
      <SpeakerSlash size={small ? 10 : 12} weight="fill" />
    </span>
  );
}

/** 实况角标。 */
function LiveBadge() {
  return (
    <span className="absolute bottom-1 left-1 flex items-center rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
      实况
    </span>
  );
}

function Lightbox({
  lb,
  setLb,
}: {
  lb: { index: number; list: MediaItem[] } | null;
  setLb: Dispatch<SetStateAction<{ index: number; list: MediaItem[] } | null>>;
}) {
  // 打开时淡入（CSS 过渡，替代 framer-motion，避免其循环依赖在生产打包下的 TDZ）
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!lb) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [lb]);

  if (!lb) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
      onClick={() => setLb(null)}
      role="dialog"
      aria-label="媒体预览"
    >
      <button
        type="button"
        aria-label="关闭"
        onClick={(e) => {
          e.stopPropagation();
          setLb(null);
        }}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X size={22} weight="bold" />
      </button>

      {lb.list.length > 1 && (
        <button
          type="button"
          aria-label="上一张"
          onClick={(e) => {
            e.stopPropagation();
            setLb((s) => (s ? { ...s, index: Math.max(0, s.index - 1) } : s));
          }}
          className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <CaretLeft size={24} weight="bold" />
        </button>
      )}

      {lb.list.length > 1 && (
        <button
          type="button"
          aria-label="下一张"
          onClick={(e) => {
            e.stopPropagation();
            setLb((s) =>
              s ? { ...s, index: Math.min(s.list.length - 1, s.index + 1) } : s,
            );
          }}
          className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <CaretRight size={24} weight="bold" />
        </button>
      )}

      <LightboxItem item={lb.list[lb.index]} />

      {lb.list.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
          {lb.index + 1} / {lb.list.length}
        </div>
      )}
    </div>
  );
}

/** 灯箱中的单个媒体：图片 / 动图 用 <img>，视频 / 实况 用 <video>。
 *  视频 / 实况 autoPlay + muted + loop + controls：自动播放不被浏览器拦截，
 *  用户可通过 controls 取消静音。 */
function LightboxItem({ item }: { item: MediaItem }) {
  if (isVideoLike(item)) {
    return (
      <video
        src={item.url}
        poster={item.poster_url}
        controls
        autoPlay
        loop
        muted
        playsInline
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] max-w-[92vw] rounded-lg bg-black object-contain"
      />
    );
  }
  return (
    <img
      src={item.url}
      alt=""
      onClick={(e) => e.stopPropagation()}
      className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain"
    />
  );
}
