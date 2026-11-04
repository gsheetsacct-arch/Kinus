import * as React from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";

/**
 * A folder of templates that looks like one: a tab on top with its name, closed by default
 * (showing how many templates are in it and the first few names), opening across the whole
 * width to show them. `actions` (Rename) sit on the tab.
 */
export function FolderBox({ name, count, peek, actions, children }: { name: string; count: number; peek: string[]; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="group open:col-span-full">
      <summary className="block cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {/* the tab */}
        <span className="ml-3 block h-3 w-24 rounded-t-lg border border-b-0 border-primary/25 bg-primary-soft group-open:bg-primary/15" aria-hidden />
        <span className="flex items-center gap-3 rounded-xl rounded-tl-sm border border-primary/25 bg-primary-soft/60 px-4 py-3 shadow-[var(--shadow-card)] transition-colors hover:bg-primary-soft group-open:rounded-b-none group-open:border-b-0 group-open:bg-primary/10">
          <Folder className="size-7 shrink-0 fill-primary/20 text-primary group-open:hidden" />
          <FolderOpen className="hidden size-7 shrink-0 fill-primary/20 text-primary group-open:block" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold" dir="auto">
              {name}
            </span>
            <span className="block truncate text-xs text-muted-foreground" dir="auto">
              {count} {count === 1 ? "template" : "templates"}
              <span className="group-open:hidden">{peek.length ? ` · ${peek.join(", ")}${count > peek.length ? "…" : ""}` : ""}</span>
            </span>
          </span>
          {actions && <span className="hidden group-open:inline">{actions}</span>}
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        </span>
      </summary>
      <div className="rounded-b-xl border border-t-0 border-primary/25 bg-primary/5 p-3 sm:p-4">{children}</div>
    </details>
  );
}
