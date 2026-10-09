import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Horizontal progress for multi-step flows (the import wizard). `current` is 1-based. */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
      {steps.map((s, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full border text-xs font-semibold",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary ring-4 ring-primary-soft",
                !done && !active && "text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" /> : n}
            </span>
            <span className={cn(active ? "font-semibold" : "text-muted-foreground")}>{s}</span>
            {n < steps.length && <span className="mx-1 hidden h-px w-8 bg-border sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}

export const IMPORT_STEPS = ["Upload file", "Match columns", "Review changes", "Done"];
