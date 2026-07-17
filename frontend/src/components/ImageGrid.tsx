'use client';

import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, CaretLeft, CaretRight } from '@phosphor-icons/react';

/**
 * 微信朋友圈九宫格：
 * - 1 张：原比例小图（最大宽 55%），不裁切。
 * - 2 / 3 / 5-9 张：3 列正方形网格，先满第一行再换行。
 * - 4 张：2x2 正方形网格。
 * - 超过 9 张：显示前 9 张，第 9 格叠加「+N」遮罩，点击查看全部。
 * - 点击任意图打开全屏灯箱，支持左右切换（箭头 / ←→ / ESC 关闭）。
 */

interface ImageGridProps {
  images: string[];
}

const MAX_VISIBLE = 9;

export function ImageGrid({ images }: ImageGridProps) {
  const reduce = useReducedMotion();
  const [lb, setLb] = useState<{ index: number; list: string[] } | null>(null);

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

  if (images.length === 0) return null;

  const hasMore = images.length > MAX_VISIBLE;
  const shown = images.slice(0, MAX_VISIBLE);
  const extra = images.length - MAX_VISIBLE;

  const openAt = (i: number) => setLb({ index: i, list: images });

  // 单图：原比例，不裁切
  if (images.length === 1) {
    return (
      <div className="mt-4">
        <div className="inline-block max-w-[55%]">
          <GridImage src={images[0]} index={0} single moreBadge={0} onClick={() => openAt(0)} />
        </div>

        <Lightbox lb={lb} setLb={setLb} reduce={!!reduce} />
      </div>
    );
  }

  const gridClass = images.length === 4 ? 'grid grid-cols-2 gap-1.5' : 'grid grid-cols-3 gap-1.5';

  return (
    <div className="mt-4">
      <div className={gridClass}>
        {shown.map((url, i) => {
          const isMoreBadge = hasMore && i === MAX_VISIBLE - 1;
          return (
            <GridImage
              key={url}
              src={url}
              index={i}
              single={false}
              moreBadge={isMoreBadge ? extra : 0}
              onClick={() => openAt(i)}
            />
          );
        })}
      </div>

      <Lightbox lb={lb} setLb={setLb} reduce={!!reduce} />
    </div>
  );
}

function Lightbox({
  lb,
  setLb,
  reduce,
}: {
  lb: { index: number; list: string[] } | null;
  setLb: Dispatch<SetStateAction<{ index: number; list: string[] } | null>>;
  reduce: boolean;
}) {
  return (
    <AnimatePresence>
      {lb && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setLb(null)}
          role="dialog"
          aria-label="图片预览"
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

          <img
            src={lb.list[lb.index]}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain"
          />

          {lb.list.length > 1 && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
              {lb.index + 1} / {lb.list.length}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface GridImageProps {
  src: string;
  index: number;
  single: boolean;
  moreBadge: number;
  onClick: () => void;
}

function GridImage({ src, index, single, moreBadge, onClick }: GridImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      type="button"
      className={`relative cursor-zoom-in overflow-hidden rounded-[4px] ${
        single ? 'block w-full' : 'aspect-square'
      }`}
      style={{ border: '1px solid var(--line)' }}
      onClick={onClick}
      aria-label={moreBadge > 0 ? `查看更多图片，共 ${moreBadge} 张` : `查看图片 ${index + 1}`}
    >
      {!loaded && (
        <div className={`absolute inset-0 ${single ? 'bg-[var(--card-2)]' : 'm-skeleton'}`} />
      )}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`transition-all duration-500 ${
          single ? 'block h-auto w-full object-cover' : 'absolute inset-0 h-full w-full object-cover'
        } ${loaded ? 'scale-100 opacity-100' : 'scale-105 opacity-0'}`}
      />
      {moreBadge > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45">
          <span className="text-lg font-semibold text-white">+{moreBadge}</span>
        </div>
      )}
    </button>
  );
}
