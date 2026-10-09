import { ListPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <ListPageSkeleton label="Building the list…" actions={2} />;
}
