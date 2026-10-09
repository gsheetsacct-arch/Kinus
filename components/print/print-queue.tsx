"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, FileDown, Printer, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatWhen } from "@/lib/utils";
import { cancelJobs, markPrinted, resendJob } from "@/app/(app)/print/actions";
import { JOB_STATUS } from "@/lib/print/labels";

export type QueueJob = {
  id: string;
  status: string;
  count: number;
  at: string;
  to: string;
  error: string | null;
  pdf: boolean;
  printedAt: string | null;
  note: string | null;
  /** The campers, for a request of one to three tags. */
  who: string | null;
  template: string;
  by: string;
  printedBy: string | null;
};


/** Opens the job's printable page in a new tab with the print dialog. */
export function openPrint(id: string) {
  window.open(`/print/jobs/${id}/sheet?print=1`, "_blank", "noopener");
}

export function PrintQueue({ jobs, show }: { jobs: QueueJob[]; show: string }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, start] = React.useTransition();
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => setNow(new Date()), []);

  // new requests arrive while the office has this open
  React.useEffect(() => {
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [router]);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (r.message) toast.success(r.message);
      setSelected(new Set());
      router.refresh();
    });

  if (!jobs.length)
    return (
      <p className="rounded-xl border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
        {show === "todo" ? "Nothing waiting to print." : "Nothing here."}{" "}
        <Link href="/print/batch" className="text-primary hover:underline">
          Print a batch
        </Link>
      </p>
    );

  const ids = [...selected];
  return (
    <div className={cn("space-y-3", pending && "opacity-70")}>
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 pl-4 shadow-[var(--shadow-card)]">
          <span className="mr-auto text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => run(() => markPrinted(ids))}>
            <CheckCheck /> Mark printed
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => run(() => cancelJobs(ids))}>
            Cancel
          </Button>
        </div>
      )}
      <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
        {jobs.map((j) => {
          const st = JOB_STATUS[j.status] ?? { label: j.status, variant: "outline" as const };
          const open = j.status !== "printed" && j.status !== "cancelled";
          return (
            <li key={j.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", selected.has(j.id) && "bg-primary-soft/40")}>
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={selected.has(j.id)}
                onChange={(e) =>
                  setSelected((cur) => {
                    const n = new Set(cur);
                    if (e.target.checked) n.add(j.id);
                    else n.delete(j.id);
                    return n;
                  })
                }
                aria-label={`Select ${j.template} for ${j.who ?? j.note ?? "this batch"}`}
              />
              <Link href={`/print/jobs/${j.id}`} className="min-w-0 flex-1 basis-60">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium" dir="auto">
                    {j.who ?? j.note ?? "Batch"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {j.template}
                    {j.count > 1 && ` · ${j.count} tags`}
                  </span>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {now ? formatWhen(j.at, now) : " "} · asked by {j.by}
                  {j.to && ` · to ${j.to}`}
                  {j.printedAt && now && ` · printed ${formatWhen(j.printedAt, now)}${j.printedBy ? ` by ${j.printedBy}` : ""}`}
                </span>
                {j.error && (
                  <span className={cn("block text-xs", j.status === "failed" ? "text-destructive" : "text-amber-700 dark:text-amber-400")} title={j.error}>
                    {j.status === "failed" ? "Couldn't make the tags. Try again, or open it to see why." : "Couldn't email the office. You can still print it here."}
                  </span>
                )}
              </Link>
              <span className="flex shrink-0 flex-wrap gap-1.5">
                {j.status !== "cancelled" && j.status !== "queued" && j.status !== "rendering" && (
                  <Button size="sm" variant={open ? "default" : "outline"} onClick={() => openPrint(j.id)}>
                    <Printer /> Print
                  </Button>
                )}
                {j.pdf && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/print/jobs/${j.id}/pdf`} target="_blank" rel="noopener">
                      <FileDown /> PDF
                    </a>
                  </Button>
                )}
                {open && j.status !== "queued" && j.status !== "rendering" && (
                  <Button size="sm" variant="outline" onClick={() => run(() => markPrinted([j.id]))}>
                    <CheckCheck /> Mark printed
                  </Button>
                )}
                {(j.status === "failed" || (j.status === "ready" && j.error)) && (
                  <Button size="sm" variant="outline" onClick={() => run(() => resendJob(j.id))}>
                    <RotateCcw /> {j.status === "failed" ? "Try again" : "Email again"}
                  </Button>
                )}
                {j.status === "printed" && (
                  <Button size="sm" variant="ghost" onClick={() => run(() => markPrinted([j.id], false))} title="Put it back in the queue">
                    <X /> Not printed
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
