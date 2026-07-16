'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Image grid for a post's images.
 *
 * Layout rules (Apple-style):
 *   1 image  → full width, 4:3 aspect ratio
 *   2 images → 2 columns, square
 *   3 images → 1 full-width + 2 square (1+2 layout)
 *   4 images → 2x2 square grid
 *   5-9     → 3 columns, square, last row left-aligned
 *
 * Each image lazy-loads with a blur-up placeholder.
 * Click opens a simple lightbox (just the image full-screen).
 */

interface ImageGridProps {
  images: string[];
}

export function ImageGrid({ images }: ImageGridProps) {
  const reduce = useReducedMotion();
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (images.length === 0) return null;

  return (
    <div className="mt-4">
      <div className={gridClass(images.length)}>
        {images.map((url, i) => (
          <GridImage
            key={url}
            src={url}
            index={i}
            total={images.length}
            onClick={() => setLightbox(url)}
          />
        ))}
      </div>

      {/* Lightbox overlay */}
      {lightbox && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-label="Image preview"
        >
          <img
            src={lightbox}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain"
          />
        </motion.div>
      )}
    </div>
  );
}

function gridClass(count: number): string {
  if (count === 1) return 'grid grid-cols-1';
  if (count === 2) return 'grid grid-cols-2 gap-1.5';
  if (count === 3) return 'grid grid-cols-2 gap-1.5'; // first item spans full
  if (count === 4) return 'grid grid-cols-2 gap-1.5';
  return 'grid grid-cols-3 gap-1.5';
}

interface GridImageProps {
  src: string;
  index: number;
  onClick: () => void;
  /** Total images in the grid (for 3-image span logic) */
  total?: number;
}

function GridImage({ src, index, onClick, total = 0 }: GridImageProps) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const aspectClass =
    total === 1
      ? 'aspect-[4/3]'
      : total === 3 && index === 0
        ? 'col-span-2 aspect-[4/3]'
        : 'aspect-square';

  return (
    <button
      type="button"
      className={`relative overflow-hidden ${aspectClass} cursor-zoom-in rounded-xl`}
      style={{ border: '1px solid var(--line)' }}
      onClick={onClick}
      aria-label={`View image ${index + 1}`}
    >
      {/* Blur placeholder */}
      {!loaded && (
        <div className="absolute inset-0 m-skeleton" />
      )}
      <img
        ref={imgRef}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 ${
          loaded
            ? 'scale-100 opacity-100'
            : 'scale-105 opacity-0'
        }`}
      />
    </button>
  );
}
