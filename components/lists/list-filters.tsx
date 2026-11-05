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
        // the filters: fcol/fval, fcol2/fval2… (lib/lists/filters)
        const field = (n: string) => form.elements.namedItem(n) as HTMLSelectElement | null;
        if (/^fcol\d*$/.test(name)) {
          const val = field(name.replace("fcol", "fval"));
          if (val) val.disabled = true;
        }
        if (name === "preset") {
          // another list: other columns, so no filters, and its own number of copies
          for (const el of [...form.elements] as HTMLSelectElement[]) if (/^f(col|val|match)\d*$/.test(el.name)) el.disabled = true;
          const copies = field("copies");
          if (copies) copies.disabled = true;
        }
        form.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
