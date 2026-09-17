// Skeleton loaders shaped like the real layouts they stand in for
// (board grid cards, kanban columns) so the page doesn't visibly jump
// once data arrives.

export function SkeletonBlock({ className = "" }) {
  return <div className={`skeleton rounded-[7px] ${className}`} />;
}

export function BoardGridSkeleton() {
  return (
    <div
      className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-hidden="true"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col rounded-card border border-border bg-surface p-4 shadow-card"
        >
          <div className="flex items-start justify-between gap-2">
            <SkeletonBlock className="h-9 w-9 !rounded-[9px]" />
            <SkeletonBlock className="h-3 w-10" />
          </div>
          <SkeletonBlock className="mt-3 h-4 w-3/5" />
          <SkeletonBlock className="mt-2 h-3 w-full" />
          <SkeletonBlock className="mt-1.5 h-3 w-4/5" />
          <div className="mt-4 flex items-center justify-between">
            <div className="flex -space-x-2">
              <SkeletonBlock className="h-8 w-8 !rounded-full" />
              <SkeletonBlock className="h-8 w-8 !rounded-full" />
              <SkeletonBlock className="h-8 w-8 !rounded-full" />
            </div>
            <SkeletonBlock className="h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

const COLUMN_CARD_COUNTS = [3, 2, 4, 1];

export function KanbanBoardSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-hidden="true">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <SkeletonBlock className="h-8 w-8 !rounded-[7px]" />
          <SkeletonBlock className="h-4 w-40" />
        </div>
        <div className="flex -space-x-2">
          <SkeletonBlock className="h-9 w-9 !rounded-full" />
          <SkeletonBlock className="h-9 w-9 !rounded-full" />
          <SkeletonBlock className="h-9 w-9 !rounded-full" />
        </div>
      </div>

      <div className="flex-1 overflow-x-auto px-4 py-4 sm:px-6">
        <div className="flex h-full items-start gap-3">
          {COLUMN_CARD_COUNTS.map((count, i) => (
            <div
              key={i}
              className="flex w-[268px] shrink-0 flex-col rounded-card border border-border bg-canvas/60 p-2.5"
            >
              <SkeletonBlock className="mb-3 h-4 w-2/3" />
              <div className="flex flex-col gap-2">
                {Array.from({ length: count }).map((__, j) => (
                  <SkeletonBlock key={j} className="h-16 w-full !rounded-card" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
