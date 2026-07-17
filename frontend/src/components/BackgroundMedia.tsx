'use client';

import { useState, useEffect } from 'react';
import type { SiteSettingsDTO } from '../utils/api';

/**
 * 整站背景层：
 *  - image: 直接铺满 <img>
 *  - video: 先用 canvas 抓取视频第一帧作为底图（避免黑屏/缓冲空白），
 *           视频可播放后淡入覆盖，实现「先出第一帧，加载完立刻切视频、无缓冲空白」。
 */
export function BackgroundMedia({ settings }: { settings: SiteSettingsDTO }) {
  const [poster, setPoster] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  const isVideo = settings.bg_type === 'video';
  const url = settings.bg_url;

  useEffect(() => {
    if (!isVideo || !url) return;
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.src = url;
    let captured = false;
    const capture = () => {
      if (captured) return;
      try {
        const w = v.videoWidth || 1280;
        const h = v.videoHeight || 720;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(v, 0, 0, w, h);
        setPoster(canvas.toDataURL('image/jpeg', 0.7));
        captured = true;
      } catch {
        // 跨域等情况下无法读取像素则忽略，仍会直接播放视频
      }
    };
    const onLoaded = () => {
      // 跳到极短时间，避免纯黑首帧
      if (v.duration > 0.05) {
        try {
          v.currentTime = Math.min(0.1, v.duration * 0.1);
        } catch {
          capture();
        }
      } else {
        capture();
      }
    };
    v.addEventListener('loadeddata', onLoaded);
    v.addEventListener('seeked', capture);
    return () => {
      v.removeEventListener('loadeddata', onLoaded);
      v.removeEventListener('seeked', capture);
      v.removeAttribute('src');
      v.load();
    };
  }, [isVideo, url]);

  if (!url || settings.bg_type === 'none') return null;

  if (settings.bg_type === 'image') {
    return <img className="bg-media" src={url} alt="" />;
  }

  // video: 底图(第一帧) + 视频淡入覆盖
  return (
    <>
      {poster && <img className="bg-media" src={poster} alt="" />}
      <video
        className="bg-media transition-opacity duration-150"
        style={{ opacity: videoReady ? 1 : 0 }}
        src={url}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onCanPlay={() => setVideoReady(true)}
        onPlaying={() => setVideoReady(true)}
      />
    </>
  );
}
