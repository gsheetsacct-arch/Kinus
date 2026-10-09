import { cn } from "@/lib/utils";

/** A grey placeholder block that gently pulses while a page loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

function Header({ actions = 0 }: { actions?: number }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: actions }, (_, i) => (
          <Skeleton key={i} className="h-8 w-20" />
        ))}
      </div>
    </div>
  );
}

function Rows({ n = 8 }: { n?: number }) {
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-20 md:block" />
          <Skeleton className="hidden h-4 w-28 md:block" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Title, a filter bar and rows: campers, lists, staff. */
export function ListPageSkeleton({ label = "Loading…", actions = 1 }: { label?: string; actions?: number }) {
  return (
    <div aria-busy="true" aria-label={label}>
      <Header actions={actions} />
      <div className="mb-4 grid gap-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] md:grid-cols-[1fr_180px_160px_140px]">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
      <Rows n={10} />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Title and a few cards: home, settings, a camper. */
export function PageSkeleton({ label = "Loading…", cards = 2 }: { label?: string; cards?: number }) {
  return (
    <div aria-busy="true" aria-label={label}>
      <Header />
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="space-y-4 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }, (_, j) => (
                <div key={j} className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
