"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { setCamp } from "@/app/(app)/camp-actions";
import { showNavigationProgress } from "./navigation-progress";

export type CampOption = { id: string; name: string };

/** Which camp everything shows: American, Hebrew, French, or all of them. */
export function CampSwitcher({ camps, current, className }: { camps: CampOption[]; current: string | null; className?: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [value, setValue] = React.useState(current ?? "all");
  React.useEffect(() => setValue(current ?? "all"), [current]);
  React.useEffect(() => {
    if (!pending) showNavigationProgress(false);
  }, [pending]);
  if (camps.length < 2) return null;
  return (
    <div className={cn("relative inline-flex min-w-0 items-center", pending && "opacity-60", className)}>
      <select
        aria-label="Camp"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          showNavigationProgress();
          start(async () => {
            await setCamp(v);
            router.refresh();
          });
        }}
        className="h-10 w-full min-w-0 cursor-pointer md:h-8 appearance-none truncate rounded-lg border bg-background py-1 pl-2.5 pr-7 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        {camps.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value="all">All camps</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-4 text-muted-foreground" />
    </div>
  );
}
