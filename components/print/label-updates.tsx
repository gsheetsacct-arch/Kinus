"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkLabelUpdates, dismissUpdates, printLabelUpdates } from "@/app/(app)/print/actions";
import type { LabelUpdate } from "@/lib/print/updates";
import { cn, plural } from "@/lib/utils";

/**
 * "Print the new ones": after a print, campers who came in since, or whose details on the
 * label changed (bunk, name…), with a button to print just those. Checked when the queue
 * opens and every couple of minutes (it reads every camper, so not on each refresh).
 */
export function LabelUpdates() {
  const router = useRouter();
  const [updates, setUpdates] = React.useState<LabelUpdate[] | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    const r = await checkLabelUpdates();
    if (r.ok) setUpdates(r.updates);
  }, []);
  React.useEffect(() => {
    load();
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, [load]);

  const run = async (key: string, call: () => Promise<{ ok: boolean; message?: string; error?: string; redirect?: string }>) => {
    setBusy(key);
    try {
      const r = await call();
      if (!r.ok) return void toast.error(r.error);
      if (r.message) toast.success(r.message);
      if (r.redirect) router.push(r.redirect);
      else await load();
    } finally {
      setBusy(null);
    }
  };

  if (!updates?.length) return null;
  return (
    <div className="space-y-2">
      {updates.map((u) => {
        const n = u.fresh.length + u.changed.length;
        const what = [u.fresh.length ? plural(u.fresh.length, "new camper") : null, u.changed.length ? `${u.changed.length} whose details on it changed` : null].filter(Boolean).join(" and ");
        const shown = open === u.templateId;
        return (
          <div key={u.templateId} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/40">
            <div className="flex flex-wrap items-center gap-3">
              <RefreshCw className="size-5 shrink-0 text-amber-700 dark:text-amber-400" />
              <span className="min-w-0 flex-1 basis-60 text-sm">
                <span className="font-medium">{u.templateName}: </span>
                {what} since {n === 1 ? "it was" : "they were"} printed.
                <span className="block text-xs text-muted-foreground">Print just these {n === 1 ? "" : n} instead of everything again.</span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                <Button size="sm" disabled={busy !== null} onClick={() => run(`print:${u.templateId}`, () => printLabelUpdates(u.templateId))}>
                  <Printer /> {busy === `print:${u.templateId}` ? "Preparing…" : `Print ${n === 1 ? "it" : `these ${n}`}`}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setOpen(shown ? null : u.templateId)} aria-expanded={shown}>
                  Who? <ChevronDown className={cn("transition-transform", shown && "rotate-180")} />
                </Button>
              </span>
            </div>
            {shown && (
              <div className="mt-3 grid gap-3 border-t border-amber-200 pt-3 text-sm sm:grid-cols-2 dark:border-amber-800">
                {(
                  [
                    ["New since the print", u.fresh],
                    ["Details on the label changed", u.changed],
                  ] as const
                ).map(
                  ([title, list]) =>
                    list.length > 0 && (
                      <div key={title}>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
                        <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                          {list.map((c) => (
                            <li key={c.id} className="flex justify-between gap-2">
                              <span dir="auto">{c.name}</span>
                              <span className="shrink-0 text-xs text-muted-foreground" dir="auto">
                                {c.where}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ),
                )}
                <div className="sm:col-span-2">
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(`dismiss:${u.templateId}`, () => dismissUpdates(u.templateId))}>
                    Not needed: don&apos;t remind me about these
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
