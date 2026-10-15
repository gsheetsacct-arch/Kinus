"use client";
import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { Toaster as Sonner } from "sonner";

/**
 * Messages after an action ("Saved.", "Couldn't save…"): a small card at the bottom of the
 * screen, out of the way of page headers and buttons. On phones it sits just above the menu
 * bar; a page with its own bar at the bottom lifts it above that too (useLiftToasts). No
 * close button: they go by themselves, or swipe them away.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      gap={8}
      visibleToasts={3}
      offset={{ bottom: "calc(24px + var(--toast-lift, 0px))" }}
      mobileOffset={{ bottom: "calc(72px + env(safe-area-inset-bottom) + var(--toast-lift, 0px))", left: "12px", right: "12px" }}
      icons={{
        success: <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />,
        error: <XCircle className="size-5 text-red-600 dark:text-red-400" />,
        warning: <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" />,
        info: <Info className="size-5 text-primary" />,
        loading: <Loader2 className="size-5 animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        duration: 4000,
        unstyled: true,
        classNames: {
          toast:
            "pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-card px-4 py-3 text-sm text-card-foreground shadow-[0_8px_24px_-6px_rgba(15,23,42,0.18),0_2px_6px_-2px_rgba(15,23,42,0.08)] sm:w-[380px]",
          icon: "mt-px flex size-5 shrink-0 items-center justify-center",
          content: "min-w-0 flex-1 space-y-0.5",
          title: "font-medium leading-snug",
          description: "text-xs leading-snug text-muted-foreground",
          success: "border-emerald-200/80 dark:border-emerald-900/60",
          error: "border-red-200/80 dark:border-red-900/60",
          warning: "border-amber-200/80 dark:border-amber-900/60",
          actionButton: "ml-auto shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground",
          cancelButton: "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted",
        },
      }}
    />
  );
}

/** Keeps messages above a bar fixed at the bottom of the page, however tall it gets. */
export function useLiftToasts(bar: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--toast-lift", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--toast-lift");
    };
  }, [bar]);
}
