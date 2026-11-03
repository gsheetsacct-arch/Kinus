"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markPrinted } from "@/app/(app)/print/actions";
import type { WaitingSet } from "@/lib/print/queue";

/** Labels in one PDF (as COMBINED_PDF_PART in lib/print/jobs). */
const PART = 400;

/**
 * Every on-the-spot label still to print (name tags and bag labels from check-in), all
 * together, sorted by name: each camper's labels one after another. Printing them remembers
 * which requests went out, so "Mark these printed" doesn't take ones that came in since.
 */
export function WaitingAll({ set, where, query }: { set: WaitingSet; where: string | null; query: string }) {
  const router = useRouter();
  const [sent, setSent] = React.useState<string[] | null>(null);
  const [pending, start] = React.useTransition();
  const parts = Math.ceil(set.tags / PART);
  const took = () => setSent((cur) => (cur && cur.length >= set.ids.length ? cur : set.ids));
  const mark = (ids: string[]) =>
    start(async () => {
      const r = await markPrinted(ids).catch(() => ({ ok: false as const, error: "That didn't go through. Check the connection and try again." }));
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Marked printed.");
      setSent(null);
      router.refresh();
    });
  const newer = sent ? set.ids.filter((id) => !sent.includes(id)).length : 0;
  return (
    <section className="mb-4 rounded-xl border-2 border-primary/40 bg-primary-soft/40 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-base font-semibold">
            {set.tags.toLocaleString()} on-the-spot {set.tags === 1 ? "label" : "labels"} waiting{where ? ` · ${where}` : ""}
          </h2>
          <p className="text-sm text-muted-foreground">
            {set.templates.join(" + ")} ({set.size}), all together, sorted by name: each camper&apos;s labels come out one after another.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" asChild>
            <a href={`/print/combined?${query}`} target="_blank" rel="noreferrer" onClick={took}>
              <Printer /> Print all
            </a>
          </Button>
          {parts <= 1 ? (
            <Button size="lg" variant="outline" asChild>
              <a href={`/print/combined/pdf?${query}`} onClick={took}>
                <FileDown /> Merged PDF
              </a>
            </Button>
          ) : (
            Array.from({ length: parts }, (_, i) => (
              <Button key={i} variant="outline" asChild title={`Labels ${i * PART + 1}–${Math.min(set.tags, (i + 1) * PART)}`}>
                <a href={`/print/combined/pdf?${query}&part=${i + 1}`} onClick={took}>
                  <FileDown /> PDF {i + 1} of {parts}
                </a>
              </Button>
            ))
          )}
        </div>
      </div>
      {sent && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-primary/20 pt-3 text-sm">
          <span className="min-w-0 flex-1">
            Printed them? Mark those {sent.length} {sent.length === 1 ? "request" : "requests"} printed.
            {newer > 0 && <span className="block text-xs text-muted-foreground">{newer} came in since: they stay waiting.</span>}
          </span>
          <Button size="sm" disabled={pending} onClick={() => mark(sent)}>
            <CheckCheck /> Mark printed
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setSent(null)}>
            Not yet
          </Button>
        </div>
      )}
    </section>
  );
}
