"use client";
import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

const listeners = new Set<(on: boolean) => void>();
/** Lets code that navigates without a link (e.g. router.refresh after a switch) show the bar. */
export function showNavigationProgress(on = true) {
  listeners.forEach((l) => l(on));
}

/**
 * A thin bar at the top while the next page loads, so a tap always shows a response,
 * even when the page itself stays on screen (same page, new filters).
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    setActive(false);
  }, [pathname, search]);

  React.useEffect(() => {
    listeners.add(setActive);
    const onClick = (e: MouseEvent) => {
      // capture phase: Next's <Link> cancels the click (to navigate itself) before it bubbles
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/lists/export")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setActive(true);
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      if (!e.defaultPrevented && f.method.toLowerCase() === "get") setActive(true);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    return () => {
      listeners.delete(setActive);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  // never stuck: give up after 15 s
  React.useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), 15000);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden" aria-hidden>
      {active && <div className="nav-progress h-full bg-primary" />}
    </div>
  );
}
