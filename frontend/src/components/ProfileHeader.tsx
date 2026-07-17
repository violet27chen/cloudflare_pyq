'use client';

import { useState, useEffect } from 'react';
import { getProfile, type ProfileDTO } from '../utils/api';
import { AUTHOR_NAME } from '../utils/config';

/**
 * 公共个人主页头部 — 微信朋友圈风格。
 *
 * 布局（从上到下）：
 *   1. 大背景封面图 (cover_image_url)
 *   2. 圆形头像，覆盖在封底底部居中
 *   3. 昵称
 *   4. 个性签名 (bio)
 */
export function ProfileHeader() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);

  useEffect(() => {
    let alive = true;
    getProfile()
      .then((p) => {
        if (alive) setProfile(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const name = profile?.display_name || AUTHOR_NAME;
  const avatar = profile?.avatar_url;
  const cover = profile?.cover_image_url;
  const bio = profile?.bio;

  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ backgroundColor: 'var(--color-surface-2)' }}>
      {/* 封面背景图 */}
      <div className="relative h-44 w-full sm:h-52 md:h-56 lg:h-64">
        {cover ? (
          <img
            src={cover}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="m-cover-fallback h-full w-full" />
        )}
        {/* 底部渐变遮罩 */}
        <div
          className="absolute inset-x-0 bottom-0 h-20"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.35), transparent)',
          }}
        />
      </div>

      {/* 头像 — 覆盖在封底底部中央 */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
        <div
          className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 text-2xl font-bold sm:h-24 sm:w-24"
          style={{
            borderColor: 'var(--bg)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--fg-muted)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}
        >
          {avatar ? (
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            name.charAt(0)
          )}
        </div>
      </div>

      {/* 信息区域 — 给头像留空间 */}
      <div className="mt-10 pb-5 pt-2 text-center sm:mt-12 sm:pb-6">
        <div
          className="text-lg font-semibold tracking-tight sm:text-xl"
          style={{ color: 'var(--fg)' }}
        >
          {name}
        </div>
        {bio && (
          <p
            className="mx-auto mt-1.5 max-w-md px-4 text-sm leading-relaxed sm:px-6"
            style={{ color: 'var(--fg-muted)' }}
          >
            {bio}
          </p>
        )}
      </div>
    </div>
  );
}
