"use client";
import * as React from "react";
import type { WaitingSet } from "@/lib/print/queue";
import { PdfButton } from "./pdf-button";
import { useMarkDownloaded, useNoteMarked } from "./download-note";

/** Labels in one PDF (as COMBINED_PDF_PART in lib/print/jobs). */
const PART = 400;

/**
 * Every label-printer label still to print (name tags and bag labels from check-in…), all
 * together, sorted by name: each camper's labels one after another, as a PDF to download. Once
 * it's downloaded, the requests in it are marked printed (Undo on the page's note).
 */
export function WaitingAll({ set, where, query }: { set: WaitingSet; where: string | null; query: string }) {
  const markDownloaded = useMarkDownloaded();
  const noteMarked = useNoteMarked();
  const parts = Math.ceil(set.tags / PART);
  // in parts: marked printed once every part is downloaded
  const got = React.useRef(new Set<number>());
  const took = (part: number) => {
    got.current.add(part);
    if (got.current.size >= parts) {
      got.current = new Set();
      void markDownloaded(set.ids);
    }
  };
  return (
    <section className="mb-4 rounded-xl border-2 border-primary/40 bg-primary-soft/40 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-base font-semibold">
            {set.tags.toLocaleString()} {set.tags === 1 ? "label" : "labels"} waiting to print{where ? ` · ${where}` : ""}
          </h2>
          <p className="text-sm text-muted-foreground">
            {set.templates.join(" + ")} ({set.size}), all together, sorted by name: each camper&apos;s labels come out one after another.
            {parts > 1 && " They're marked printed once every part is downloaded."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {parts <= 1 ? (
            // one PDF: the server marks its requests printed as it sends it
            <PdfButton href={`/print/combined/pdf?${query}`} label="Download PDF and mark printed" mark={set.ids} onDone={() => noteMarked(set.ids)} />
          ) : (
            Array.from({ length: parts }, (_, i) => <PdfButton key={i} size="default" href={`/print/combined/pdf?${query}&part=${i + 1}`} label={`Download PDF ${i + 1} of ${parts}`} onDone={() => took(i + 1)} />)
          )}
        </div>
      </div>
    </section>
  );
}
