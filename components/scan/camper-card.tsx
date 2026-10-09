"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ChevronRight, MoreHorizontal, Phone, Printer, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { cardActions } from "@/lib/attendance/scan";
import type { AttendanceEventType, CamperStatus } from "@/lib/attendance/machine";
import { cn, formatPhone, formatTime } from "@/lib/utils";
import { loadCard, recordFromCard, requestTag, undoScan, type CardData, type ScanOutcome } from "@/app/(app)/scan/actions";

export type TemplateButton = { id: string; name: string };
const TONE: Record<string, string> = {
  in: "bg-status-present text-white hover:bg-status-present/90",
  out: "bg-status-out text-amber-950 hover:bg-status-out/90",
  home: "bg-status-departed text-white hover:bg-status-departed/90",
};
const UNDO_MS = 30000;
const PRINT_LABEL: Record<string, string> = {
  queued: "Sending…",
  rendering: "Sending…",
  ready: "In print queue",
  sent: "Sent",
  printed: "Printed",
  failed: "Failed",
};

/** Everything about one camper in one place: where they are, actions, tags, parents. */
export function CamperCard({
  camperId,
  templates,
  canScan,
  onAction,
  compact,
  embedded,
  initial,
}: {
  camperId: string;
  templates: TemplateButton[];
  canScan: boolean;
  onAction?: (o: Extract<ScanOutcome, { ok: true; kind: "act" }>) => void;
  compact?: boolean;
  /** On the camper's own page: no name header, contacts or "full details" link. */
  embedded?: boolean;
  /** Already loaded by the page: shown at once, no extra request. */
  initial?: CardData | null;
}) {
  const [card, setCard] = React.useState<CardData | null | undefined>(initial);
  const [pending, start] = React.useTransition();
  const [printOpts, setPrintOpts] = React.useState<TemplateButton | null>(null);
  // "Not coming back" asks once more; after any change the buttons rest a moment, so a
  // second tap doesn't land on the button that just appeared under the finger
  const [confirming, setConfirming] = React.useState<AttendanceEventType | null>(null);
  const [resting, setResting] = React.useState(false);
  const [done, setDone] = React.useState<Extract<ScanOutcome, { ok: true; kind: "act" }> | null>(null);
  const reload = React.useCallback(() => loadCard(camperId).then(setCard), [camperId]);
  const first = React.useRef(initial !== undefined);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setCard(undefined);
    reload();
  }, [reload]);

  if (card === undefined) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (card === null) return <p className="text-sm text-muted-foreground">This camper isn&apos;t in your area.</p>;

  const act = (event: AttendanceEventType) =>
    start(async () => {
      setConfirming(null);
      setResting(true);
      setTimeout(() => setResting(false), 1200);
      const r = await recordFromCard(card.id, event);
      if (!r.ok) return void toast.error(r.error);
      if (r.kind === "act") {
        onAction?.(r);
        // said on the card itself, with Undo: a notice would cover the name, and a pop-up
        // card blocks taps on it
        setDone(r);
        setTimeout(() => setDone((d) => (d === r ? null : d)), UNDO_MS);
      }
      reload();
    });
  const undo = () =>
    start(async () => {
      if (!done) return;
      const u = await undoScan(done.eventId);
      if (!u.ok) return void toast.error(u.error);
      toast.success(`Undone: ${done.name}`);
      onAction?.({ ...done, status: u.status });
      setDone(null);
      reload();
    });
  const print = (t: TemplateButton, opts: { copies?: number; deliverTo?: string } = {}) =>
    start(async () => {
      const r = await requestTag(card.id, t.id, opts);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${t.name}: ${r.message}`);
      setTimeout(reload, 1500);
      setTimeout(reload, 6000);
    });

  return (
    <div className={cn("space-y-4", pending && "opacity-70")}>
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1 basis-48">
            <h2 className="break-words text-2xl font-semibold" dir="auto">
              {card.name}
            </h2>
            <p className="text-sm text-muted-foreground" dir="auto">
              {[card.division, card.bunk ?? "no bunk"].filter(Boolean).join(" · ")} · <span className="font-mono">{card.code}</span>
            </p>
          </div>
          <StatusBadge status={card.status} className="shrink-0 text-sm" />
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {embedded && <StatusBadge status={card.status} className="mr-2 align-middle" />}
        {card.since ? `Since ${formatTime(card.since)}${card.by ? ` · ${card.by}` : ""}` : "Not checked in yet"}
      </p>
      {card.medicalFlag && !embedded && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="size-4" /> Medical flag: allergies, EpiPen or medications.
        </p>
      )}
      {canScan && done && (
        <div className="flex items-center gap-3 rounded-xl border bg-muted/50 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">
            Done: {done.verb}
            {done.autoPrinted.length > 0 && ` · ${done.autoPrinted.join(", ")} sent to print`}
          </span>
          <Button size="sm" variant="outline" className="h-9" disabled={pending} onClick={undo}>
            <Undo2 /> Undo
          </Button>
        </div>
      )}
      {canScan && confirming && (
        <div className="space-y-2 rounded-xl border border-status-departed/40 p-3">
          <p className="text-sm font-medium">Check {card.name} out for the day: not coming back today?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="lg" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button size="lg" className={TONE.home} disabled={pending} onClick={() => act(confirming)}>
              Not coming back
            </Button>
          </div>
        </div>
      )}
      {canScan && !confirming && (
        <div className="grid gap-2 sm:grid-cols-2">
          {cardActions(card.status).map((a) => (
            <Button
              key={a.event + a.label}
              size="xl"
              className={cn("h-auto min-h-14 w-full whitespace-normal px-4 py-2 leading-tight", TONE[a.tone])}
              disabled={pending || resting}
              onClick={() => (a.tone === "home" ? setConfirming(a.event) : act(a.event))}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
      {templates.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Send to the office to print</div>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => {
              const p = card.prints[t.id];
              return (
                <span key={t.id} className="inline-flex overflow-hidden rounded-lg border">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => print(t)}
                    className="flex min-h-10 items-center gap-2 bg-card px-3 py-2 text-left text-sm font-medium hover:bg-muted"
                    aria-label={`Send ${t.name} to the office to print`}
                  >
                    <Printer className="size-4" /> {t.name}
                    {p && (
                      <span className={cn("text-xs font-normal", p.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                        · {PRINT_LABEL[p.status] ?? p.status} {formatTime(p.at)}
                      </span>
                    )}
                  </button>
                  <button type="button" className="border-l bg-card px-2.5 text-muted-foreground hover:bg-muted" onClick={() => setPrintOpts(t)} aria-label={`Copies or send ${t.name} somewhere else`} title="Copies / send to…">
                    <MoreHorizontal className="size-4" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}
      {card.contacts && card.contacts.length > 0 && !compact && !embedded && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Call</div>
          {card.contacts
            .filter((k) => k.tel)
            .map((k, i) => (
              <a key={i} href={`tel:${k.tel}`} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm hover:bg-muted">
                <Phone className="size-4 text-primary" />
                <span className="w-24 shrink-0 text-xs text-muted-foreground">{k.label}</span>
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {k.name ?? ""}
                </span>
                <span className="shrink-0 font-medium">{formatPhone(k.phone)}</span>
              </a>
            ))}
        </div>
      )}
      {!embedded && (
        <Link href={`/campers/${card.id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          Full details <ChevronRight className="size-4" />
        </Link>
      )}
      <PrintOptions template={printOpts} onClose={() => setPrintOpts(null)} onSend={(t, o) => print(t, o)} />
    </div>
  );
}

function PrintOptions({ template, onClose, onSend }: { template: TemplateButton | null; onClose: () => void; onSend: (t: TemplateButton, o: { copies: number; deliverTo?: string }) => void }) {
  const [copies, setCopies] = React.useState(1);
  const [to, setTo] = React.useState("");
  React.useEffect(() => {
    if (template) setTo(localStorage.getItem("kinus:print-to") ?? "");
  }, [template]);
  return (
    <Dialog open={Boolean(template)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{template?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Copies" htmlFor="copies">
            <Input id="copies" type="number" min={1} max={10} value={copies} onChange={(e) => setCopies(Number(e.target.value) || 1)} className="w-24" />
          </Field>
          <Field label="Send to (leave empty for the office)" htmlFor="send-to" hint="For example if the office printer is down today. Remembered on this device.">
            <Input id="send-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="office email" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              try {
                if (to) localStorage.setItem("kinus:print-to", to);
                else localStorage.removeItem("kinus:print-to");
              } catch {}
              if (template) onSend(template, { copies, deliverTo: to || undefined });
              onClose();
            }}
          >
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { CamperStatus };
