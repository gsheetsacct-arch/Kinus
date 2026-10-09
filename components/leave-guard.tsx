"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * While there are unsaved changes, links inside the app (sidebar, back links) ask first
 * instead of quietly throwing the work away; closing or reloading the tab asks too.
 */
export function LeaveGuard({ dirty, onSave }: { dirty: boolean; onSave?: () => Promise<boolean> }) {
  const router = useRouter();
  const [to, setTo] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      // window capture runs before Next's link handler and the progress bar
      e.preventDefault();
      e.stopPropagation();
      setTo(url.pathname + url.search + url.hash);
    };
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirty]);

  const go = (href: string) => {
    setTo(null);
    router.push(href);
  };

  return (
    <Dialog open={to !== null} onOpenChange={(o) => !o && setTo(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save your changes?</DialogTitle>
          <DialogDescription>You changed this but haven&apos;t saved. If you leave now, the changes are lost.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" className="text-destructive" onClick={() => to && go(to)}>
            Leave without saving
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTo(null)}>
              Stay
            </Button>
            {onSave && (
              <Button
                disabled={saving}
                onClick={async () => {
                  const href = to;
                  setSaving(true);
                  const ok = await onSave().finally(() => setSaving(false));
                  if (ok && href) go(href);
                }}
              >
                {saving ? "Saving…" : "Save and leave"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
