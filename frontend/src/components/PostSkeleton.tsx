'use client';

/**
 * Skeleton loader matching the PostCard shape.
 * Shown while the feed is loading.
 */

export function PostSkeleton() {
  return (
    <div className="m-card overflow-hidden">
      <div className="p-5 sm:p-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-3">
          <div className="m-skeleton h-10 w-10 rounded-full" />
          <div className="flex-1">
            <div className="m-skeleton h-4 w-24 rounded" />
          </div>
          <div className="m-skeleton h-3 w-12 rounded" />
        </div>

        {/* Content skeleton */}
        <div className="mt-4 space-y-2">
          <div className="m-skeleton h-4 w-full rounded" />
          <div className="m-skeleton h-4 w-4/5 rounded" />
          <div className="m-skeleton h-4 w-3/5 rounded" />
        </div>

        {/* Image skeleton */}
        <div className="mt-4">
          <div className="m-skeleton aspect-[4/3] w-full rounded-xl" />
        </div>

        {/* Footer skeleton */}
        <div className="mt-4 flex items-center gap-2">
          <div className="m-skeleton h-5 w-5 rounded-full" />
          <div className="m-skeleton h-3 w-8 rounded" />
        </div>
      </div>
    </div>
  );
}

/** Multiple skeletons for the initial load. */
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <PostSkeleton key={i} />
      ))}
    </div>
  );
}
