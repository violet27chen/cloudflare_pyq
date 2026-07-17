'use client';

import { useEffect, useState } from 'react';
import {
  getSettings,
  type SiteSettingsDTO,
  type ThemeColors,
} from '../utils/api';
import { BackgroundMedia } from './BackgroundMedia';

/**
 * 全局主题应用器。
 * - 拉取 /api/settings（背景 + 主题颜色），把自定义颜色写到 documentElement
 *   的 CSS 变量上，覆盖默认设计 token（亮/暗模式都生效，inline style 优先级最高）。
 * - 渲染整站背景层（图片/视频），由它统一负责，避免各处重复。
 * 挂载在 BaseLayout，所有页面（首页 / 后台）都生效。
 */

// 颜色 token -> CSS 变量名
const COLOR_VAR_MAP: Record<keyof ThemeColors, string> = {
  bg: '--bg',
  card: '--card',
  card_2: '--card-2',
  line: '--line',
  fg: '--fg',
  fg_soft: '--fg-soft',
  fg_muted: '--fg-muted',
  accent: '--color-accent',
  bio: '--bio',
};

function hexToRgb(hex: string) {
  let h = hex.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** 由强调色派生浅色底（按钮 hover/soft 背景） */
function deriveAccentSoft(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c: number) => Math.round(c * 0.15 + 255 * 0.85);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** 由强调色派生深一档文字色 */
function deriveAccentInk(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c: number) => Math.round(c * 0.78);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export function ThemeApplier() {
  const [settings, setSettings] = useState<SiteSettingsDTO | null>(null);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then((s) => {
        if (alive) setSettings(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 应用颜色到 :root
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    const colors = settings.colors;
    (Object.keys(COLOR_VAR_MAP) as (keyof ThemeColors)[]).forEach((key) => {
      const value = colors?.[key] ?? '';
      const cssVar = COLOR_VAR_MAP[key];
      if (value) {
        root.style.setProperty(cssVar, value);
        if (key === 'accent') {
          root.style.setProperty('--color-accent-soft', deriveAccentSoft(value));
          root.style.setProperty('--color-accent-ink', deriveAccentInk(value));
        }
      } else {
        root.style.removeProperty(cssVar);
        if (key === 'accent') {
          root.style.removeProperty('--color-accent-soft');
          root.style.removeProperty('--color-accent-ink');
        }
      }
    });
  }, [settings]);

  // 整站背景层
  if (!settings || settings.bg_type === 'none' || !settings.bg_url) {
    return null;
  }
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <BackgroundMedia settings={settings} />
    </div>
  );
}
