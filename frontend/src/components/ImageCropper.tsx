'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from '@phosphor-icons/react';

/**
 * 侧边栏图片裁剪器。
 *
 * 需求：固定宽度（贴合列宽、不超出），高度可自由调整。
 *  - 裁剪框宽度锁定为图片全宽（渲染到列里就是 100% 列宽，不会超出）。
 *  - 用户拖动顶部 / 底部手柄，或拖动整块选区，自由调整裁剪高度与上下位置。
 *  - 确认后用 canvas 按原图分辨率导出所选纵向区域，回传 File 供上传。
 *
 * props:
 *  - file: 待裁剪的原始图片 File
 *  - onCancel: 取消
 *  - onConfirm(file): 返回裁剪后的图片 File
 */
export function ImageCropper({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
}) {
  const [src, setSrc] = useState<string>('');
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [dispW, setDispW] = useState(320); // 模态内展示宽度（像素）
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);

  // 裁剪区（以「展示坐标」记录）：全宽，纵向 [top, top+height]
  const [cropTop, setCropTop] = useState(0);
  const [cropH, setCropH] = useState(0);
  const [exporting, setExporting] = useState(false);

  // 展示高度 = 原图等比缩放到 dispW 后的高度
  const dispH = natural ? (natural.h * dispW) / natural.w : 0;

  // 读取文件为 dataURL
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => setSrc(String(reader.result));
    reader.readAsDataURL(file);
  }, [file]);

  // 图片加载后初始化裁剪区（默认全高，或最多 16:9 一屏）
  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    imgElRef.current = el;
    const nw = el.naturalWidth;
    const nh = el.naturalHeight;
    setNatural({ w: nw, h: nh });
    // 根据容器可用宽度决定展示宽度（最大 360，避免超出模态）
    const avail = imgWrapRef.current?.clientWidth ?? 320;
    const w = Math.min(360, avail, nw);
    setDispW(w);
    const h = (nh * w) / nw;
    setCropTop(0);
    setCropH(h); // 默认选全部
  }, []);

  const MIN_H = 40; // 最小裁剪高度（展示像素）

  // 拖动逻辑
  const dragState = useRef<{
    mode: 'move' | 'top' | 'bottom';
    startY: number;
    startTop: number;
    startH: number;
  } | null>(null);

  const onPointerDown = (mode: 'move' | 'top' | 'bottom') => (
    e: React.PointerEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragState.current = {
      mode,
      startY: e.clientY,
      startTop: cropTop,
      startH: cropH,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = dragState.current;
    if (!st) return;
    const dy = e.clientY - st.startY;
    if (st.mode === 'move') {
      let t = st.startTop + dy;
      t = Math.max(0, Math.min(t, dispH - st.startH));
      setCropTop(t);
    } else if (st.mode === 'top') {
      let t = st.startTop + dy;
      t = Math.max(0, Math.min(t, st.startTop + st.startH - MIN_H));
      setCropTop(t);
      setCropH(st.startTop + st.startH - t);
    } else if (st.mode === 'bottom') {
      let h = st.startH + dy;
      h = Math.max(MIN_H, Math.min(h, dispH - st.startTop));
      setCropH(h);
    }
  };

  const onPointerUp = () => {
    dragState.current = null;
  };

  const handleConfirm = async () => {
    if (!natural || !src) return;
    setExporting(true);
    try {
      const scale = natural.w / dispW; // 展示 → 原图
      const sy = Math.round(cropTop * scale);
      const sh = Math.round(cropH * scale);
      const canvas = document.createElement('canvas');
      canvas.width = natural.w;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 不可用');
      const img = new Image();
      img.src = src;
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('图片加载失败'));
      });
      ctx.drawImage(img, 0, sy, natural.w, sh, 0, 0, natural.w, sh);
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), 'image/jpeg', 0.9),
      );
      if (!blob) throw new Error('导出失败');
      const name = file.name.replace(/\.[^.]+$/, '') + '-crop.jpg';
      onConfirm(new File([blob], name, { type: 'image/jpeg' }));
    } catch (err) {
      alert(err instanceof Error ? err.message : '裁剪失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-lg"
        style={{ backgroundColor: 'var(--card)' }}
      >
        {/* header */}
        <div
          className="flex items-center justify-between border-b p-4"
          style={{ borderColor: 'var(--line)' }}
        >
          <h3 className="text-base font-semibold" style={{ color: 'var(--fg)' }}>
            裁剪图片
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: 'var(--fg-muted)' }}
            aria-label="关闭"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* body */}
        <div className="p-4">
          <p className="mb-3 text-xs" style={{ color: 'var(--fg-muted)' }}>
            宽度已锁定为列宽，拖动上下边缘或选区调整高度。
          </p>
          <div
            ref={imgWrapRef}
            className="mx-auto select-none"
            style={{ width: dispW || '100%', touchAction: 'none' }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {src && (
              <div className="relative" style={{ width: dispW, height: dispH }}>
                {/* 原图（半暗底衬） */}
                <img
                  src={src}
                  alt=""
                  onLoad={onImgLoad}
                  className="block w-full select-none"
                  style={{ height: dispH || 'auto', opacity: 0.4 }}
                  draggable={false}
                />
                {natural && (
                  <>
                    {/* 亮区（裁剪选区，显示原图清晰部分） */}
                    <div
                      className="absolute left-0 overflow-hidden"
                      style={{
                        top: cropTop,
                        height: cropH,
                        width: dispW,
                        boxShadow: '0 0 0 2px var(--color-accent)',
                        cursor: 'move',
                      }}
                      onPointerDown={onPointerDown('move')}
                    >
                      <img
                        src={src}
                        alt=""
                        className="pointer-events-none absolute left-0 w-full max-w-none select-none"
                        style={{ top: -cropTop, height: dispH }}
                        draggable={false}
                      />
                    </div>
                    {/* 顶部手柄 */}
                    <div
                      className="absolute left-0 flex w-full items-center justify-center"
                      style={{
                        top: cropTop - 6,
                        height: 12,
                        cursor: 'ns-resize',
                      }}
                      onPointerDown={onPointerDown('top')}
                    >
                      <div
                        className="h-1.5 w-10 rounded-full"
                        style={{ backgroundColor: 'var(--color-accent)' }}
                      />
                    </div>
                    {/* 底部手柄 */}
                    <div
                      className="absolute left-0 flex w-full items-center justify-center"
                      style={{
                        top: cropTop + cropH - 6,
                        height: 12,
                        cursor: 'ns-resize',
                      }}
                      onPointerDown={onPointerDown('bottom')}
                    >
                      <div
                        className="h-1.5 w-10 rounded-full"
                        style={{ backgroundColor: 'var(--color-accent)' }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        <div
          className="flex items-center justify-end gap-3 border-t p-4"
          style={{ borderColor: 'var(--line)' }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: 'var(--fg-muted)' }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={exporting || !natural}
            className="m-btn-primary px-5 py-2 text-sm disabled:opacity-50"
          >
            {exporting ? '处理中...' : '确认裁剪'}
          </button>
        </div>
      </div>
    </div>
  );
}
