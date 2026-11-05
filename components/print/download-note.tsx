"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markPrinted } from "@/app/(app)/print/actions";
import { AfterDownload, phoneOf } from "./pdf-button";

type Note = { ids: string[]; at: number };
let current: Note | null = null;
const listeners = new Set<() => void>();
const set = (n: Note | null) => {
  current = n;
  for (const l of listeners) l();
};

/**
 * A PDF downloaded: its requests are marked printed (they leave the waiting list), and the page's
 * note says so, with Undo and, on a phone, how to print it on the label printer.
 */
export function useMarkDownloaded() {
  const router = useRouter();
  return React.useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const r = await markPrinted(ids, true, undefined, true).catch(() => ({ ok: false as const, error: "Check the connection." }));
      if (!r.ok) return void toast.error(`Downloaded, but not marked printed: ${r.error} Mark them printed once they're out.`);
      set({ ids, at: Date.now() });
      router.refresh();
    },
    [router],
  );
}

/** After a "Download PDF and mark printed" the server marked: the note, and the page read again. */
export function useNoteMarked() {
  const router = useRouter();
  return React.useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      set({ ids, at: Date.now() });
      router.refresh();
    },
    [router],
  );
}

/** The note at the top of the queue after a download (see useMarkDownloaded). */
export function DownloadNote() {
  const router = useRouter();
  const note = React.useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => current,
    () => null,
  );
  const [phone, setPhone] = React.useState<"android" | "ios" | null>(null);
  const [pending, start] = React.useTransition();
  React.useEffect(() => setPhone(phoneOf()), []);
  if (!note) return null;
  const n = note.ids.length;
  const undo = () =>
    start(async () => {
      const r = await markPrinted(note.ids, false).catch(() => ({ ok: false as const, error: "That didn't go through. Check the connection and try again." }));
      if (!r.ok) return void toast.error(r.error);
      toast.success(n === 1 ? "Back in the queue." : `${n} requests back in the queue.`);
      set(null);
      router.refresh();
    });
  return (
    <div className="mb-4 space-y-2 rounded-xl border border-status-present/40 bg-status-present/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCheck className="size-4 shrink-0 text-status-present" />
        <span className="min-w-0 flex-1 text-sm font-medium">
          Downloaded, and {n === 1 ? "the request is" : `the ${n} requests are`} marked printed.
        </span>
        <Button size="sm" variant="outline" disabled={pending} onClick={undo} title="Didn't print? Put them back in the queue">
          <Undo2 /> Undo
        </Button>
        <Button size="icon" variant="ghost" className="size-8" onClick={() => set(null)} aria-label="Close">
          <X />
        </Button>
      </div>
      {phone && <AfterDownload phone={phone} />}
    </div>
  );
}
