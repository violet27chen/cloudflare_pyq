'use client';

import { useState, useEffect } from 'react';
import { X } from '@phosphor-icons/react';
import { getProfile, isVideoUrl, type ProfileDTO } from '../utils/api';

/**
 * 公开个人主页头部 — 全宽封面 + 左下角头像/昵称叠加。
 *
 * 参考：微信朋友圈资料页风格——
 *   封面全宽平铺，头像(小)+名字在封面左下角叠在封面上，
 *   无独立信息带，下方直接接动态内容。
 *
 * profile 由 Feed 统一拉取后传入（单一数据源），避免各自 fetch
 * 导致加载中出现占位名 "L." 的闪烁。
 */
export function ProfileHeader({ profile: propProfile }: { profile?: ProfileDTO | null }) {
  const [profile, setProfile] = useState<ProfileDTO | null>(propProfile ?? null);
  const [showCover, setShowCover] = useState(false);

  useEffect(() => {
    // 若由父级传入 profile，则以其为准；否则自行拉取一次。
    if (propProfile !== undefined) {
      setProfile(propProfile);
      return;
    }
    let alive = true;
    getProfile()
      .then((p) => {
        if (alive) setProfile(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [propProfile]);

  // ESC 关闭大图
  useEffect(() => {
    if (!showCover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCover(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCover]);

  // 加载中（profile 为 null）时不渲染任何占位名，避免闪现 "L."
  if (!profile) return null;

  const name = profile.display_name ?? '';
  const avatar = profile.avatar_url;
  const cover = profile.cover_image_url;
  const bio = profile.bio;

  const openCover = () => {
    if (cover) setShowCover(true);
  };

  return (
    <div className="relative">
      {cover ? (
        <>
          {/* 封面背景图 — 4:3 比例 + 点击看大图 */}
          <div
            className="relative aspect-[4/3] w-full cursor-pointer"
            onClick={openCover}
            role="button"
            tabIndex={0}
            aria-label="查看背景大图"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openCover();
              }
            }}
          >
            {/* 内层裁剪容器 */}
            <div className="absolute inset-0 overflow-hidden">
              {isVideoUrl(cover) ? (
                <>
                  {/* 视频封面：静音自动循环播放 */}
                  <video
                    src={cover}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {/* 底部渐变遮罩 — 让叠加文字可读 */}
                  <div
                    className="absolute inset-x-0 bottom-0 h-24"
                    style={{
                      background: 'linear-gradient(to top, rgba(0,0,0,0.45), transparent)',
                    }}
                  />
                </>
              ) : (
                <>
                  {/* 模糊底层 */}
                  <img
                    src={cover}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl"
                  />
                  {/* 清晰层：中心清晰、边缘羽化 */}
                  <img
                    src={cover}
                    alt=""
                    className="relative h-full w-full object-cover"
                    style={{
                      WebkitMaskImage:
                        'radial-gradient(ellipse 88% 88% at 50% 50%, #000 68%, transparent 100%)',
                      maskImage:
                        'radial-gradient(ellipse 88% 88% at 50% 50%, #000 68%, transparent 100%)',
                    }}
                  />
                  {/* 底部渐变遮罩 — 让叠加文字可读 */}
                  <div
                    className="absolute inset-x-0 bottom-0 h-24"
                    style={{
                      background: 'linear-gradient(to top, rgba(0,0,0,0.45), transparent)',
                    }}
                  />
                </>
              )}
            </div>

            {/* 左下角：小头像 + 昵称，叠在封面上 */}
            <div className="absolute bottom-4 left-5 flex items-center gap-2.5">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 text-sm font-bold sm:h-11 sm:w-11"
                style={{
                  borderColor: 'rgba(255,255,255,0.7)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--fg-muted)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}
              >
                {avatar ? (
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  (name ? name.charAt(0) : '')
                )}
              </div>
              <span
                className="text-base font-semibold tracking-tight drop-shadow-sm sm:text-lg"
                style={{ color: '#fff' }}
              >
                {name}
              </span>
            </div>
          </div>
          {bio && (
            <p className="px-5 pt-3 text-sm leading-relaxed" style={{ color: 'var(--bio)' }}>
              {bio}
            </p>
          )}
        </>
      ) : (
        <>
          {/* 无背景图：仅显示一行头像 + 名字 */}
          <div className="flex items-center justify-start gap-2.5 px-4 py-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 text-sm font-bold sm:h-11 sm:w-11"
            style={{
              borderColor: 'var(--line)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--fg-muted)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              (name ? name.charAt(0) : '')
            )}
          </div>
          <span
            className="text-base font-semibold tracking-tight sm:text-lg"
            style={{ color: 'var(--fg)' }}
          >
            {name}
          </span>
        </div>
        {bio && (
          <p className="px-4 pt-1 text-sm leading-relaxed" style={{ color: 'var(--bio)' }}>
            {bio}
          </p>
        )}
        </>
      )}

      {/* 背景图大图查看（无模糊原图 / 视频可播放） */}
      {showCover && cover && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setShowCover(false)}
          role="dialog"
          aria-modal="true"
          aria-label="背景大图"
        >
          <button
            type="button"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            onClick={() => setShowCover(false)}
            aria-label="关闭"
          >
            <X size={22} weight="bold" />
          </button>
          {isVideoUrl(cover) ? (
            <video
              src={cover}
              controls
              autoPlay
              loop
              muted
              playsInline
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain"
            />
          ) : (
            <img
              src={cover}
              alt=""
              className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}
