"use client";
import * as React from "react";

/** The list's choices apply as soon as one changes (no "Show" button to find). */
export function ListFilters({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form
      method="get"
      className={className}
      onChange={(e) => {
        const form = e.currentTarget;
        // a new division: its bunks differ, so start from all of them
        if ((e.target as unknown as HTMLSelectElement).name === "division") {
          const bunk = form.elements.namedItem("bunk") as HTMLSelectElement | null;
          if (bunk) bunk.value = "";
        }
        // another column (or another list) to filter by: its answers differ, so start from "has anything"
        const name = (e.target as unknown as HTMLSelectElement).name;
        if (name === "fcol" || name === "preset") {
          const val = form.elements.namedItem("fval") as HTMLSelectElement | null;
          if (val) val.disabled = true;
          if (name === "preset") {
            const col = form.elements.namedItem("fcol") as HTMLSelectElement | null;
            if (col) col.value = "";
          }
        }
        form.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
