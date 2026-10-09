"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, FileDown, Printer, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelJobs, markPrinted, resendJob } from "@/app/(app)/print/actions";
import { fitPreview } from "@/lib/print/fit-preview";

/**
 * The job's tags in a frame, printable from here. With autoPrint (right after "Print a
 * batch") the print dialog opens as soon as the names have been sized to fit.
 */
export function JobPreview({ id, autoPrint }: { id: string; autoPrint: boolean }) {
  const frame = React.useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = React.useState(false);
  const printFrame = React.useCallback(() => frame.current?.contentWindow?.print(), []);
  React.useEffect(() => {
    if (!ready || !autoPrint) return;
    printFrame();
    // don't print again on refresh
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [ready, autoPrint, printFrame]);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Preview</h2>
        <Button size="sm" onClick={printFrame} disabled={!ready}>
          <Printer /> {ready ? "Print" : "Preparing…"}
        </Button>
      </div>
      <iframe
        ref={frame}
        src={`/print/jobs/${id}/sheet`}
        title="Tags to print"
        className="h-[60vh] w-full rounded-xl border bg-muted"
        onLoad={() => {
          const doc = frame.current?.contentDocument;
          const wait = () => {
            if (!doc?.body?.getAttribute("data-fitted")) return void setTimeout(wait, 100);
            fitPreview(frame.current);
            setReady(true);
          };
          wait();
        }}
      />
    </div>
  );
}

export function JobActions({ id, status, pdf, deliverTo }: { id: string; status: string; pdf: boolean; deliverTo: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [to, setTo] = React.useState(deliverTo);
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (r.message) toast.success(r.message);
      router.refresh();
    });
  const open = status !== "printed" && status !== "cancelled";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {open ? (
          <Button disabled={pending} onClick={() => run(() => markPrinted([id]))}>
            <CheckCheck /> Mark printed
          </Button>
        ) : (
          status === "printed" && (
            <Button variant="outline" disabled={pending} onClick={() => run(() => markPrinted([id], false))}>
              Not printed after all
            </Button>
          )
        )}
        {pdf && (
          <Button variant="outline" asChild>
            <a href={`/print/jobs/${id}/pdf`} target="_blank" rel="noopener">
              <FileDown /> PDF
            </a>
          </Button>
        )}
        {open && (
          <Button variant="ghost" className="text-destructive" disabled={pending} onClick={() => run(() => cancelJobs([id]))}>
            Cancel job
          </Button>
        )}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => resendJob(id, to));
        }}
      >
        <label className="min-w-0 flex-1 space-y-1.5">
          <span className="text-sm font-medium">Email it (again) to</span>
          <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="the office email" />
        </label>
        <Button type="submit" variant="outline" disabled={pending}>
          <Send /> Send
        </Button>
      </form>
    </div>
  );
}
