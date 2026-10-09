import { Skeleton, PageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-6 h-36 rounded-xl" />
      <PageSkeleton label="Loading camper…" />
    </div>
  );
}
