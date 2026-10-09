import { Skeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading who's here">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
