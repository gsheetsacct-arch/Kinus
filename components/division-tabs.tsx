"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Switching divisions on the setup page happens in the browser: every division's details
 * come with the page, so a tap shows them at once instead of asking the server again.
 */
const Ctx = React.createContext<{ selected: string; select: (id: string) => void }>({ selected: "", select: () => undefined });

export function DivisionTabs({ initial, children }: { initial: string; children: React.ReactNode }) {
  const [selected, setSelected] = React.useState(initial);
  const select = React.useCallback((id: string) => {
    setSelected(id);
    window.history.replaceState(null, "", `?d=${id}`);
    // phones: the details are below the list
    if (!window.matchMedia("(min-width: 1024px)").matches) requestAnimationFrame(() => document.getElementById("details")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);
  return <Ctx.Provider value={{ selected, select }}>{children}</Ctx.Provider>;
}

/** Style the chosen one with `data-[active=true]:` (and `group-data-[active=true]:` inside). */
export function DivisionTab({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { selected, select } = React.useContext(Ctx);
  const active = selected === id;
  return (
    <button type="button" onClick={() => select(id)} aria-pressed={active} data-active={active} className={cn("group w-full text-left", className)}>
      {children}
    </button>
  );
}

export function DivisionPanel({ id, children }: { id: string; children: React.ReactNode }) {
  const { selected } = React.useContext(Ctx);
  return selected === id ? <>{children}</> : null;
}
