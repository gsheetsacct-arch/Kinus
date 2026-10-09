import { Skeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-3 rounded-2xl border-4 border-muted p-4" aria-busy="true" aria-label="Loading check-in">
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
      <Skeleton className="h-14" />
      <Skeleton className="h-4 w-48" />
    </div>
  );
}
