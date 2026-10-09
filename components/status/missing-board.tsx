"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Clock, MessageSquare, Phone, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CamperCard, type TemplateButton } from "@/components/scan/camper-card";
import { decodeScope, inScope, scopeExists, type BoardScope } from "@/lib/attendance/board";
import { campClock, missingStates, type Followup, type MissingRules, type MissingState } from "@/lib/attendance/missing";
import type { BoardRow } from "@/lib/data/board";
import { campDateTimeToIso, campToday } from "@/lib/time";
import { CAMP_TIME_ZONE, cn, formatWhen } from "@/lib/utils";
import { checkInNow, clearFollowup, markNotComing, saveFollowup, undoNotComing } from "@/app/(app)/missing/actions";
import { ScopeSelect, useScope, type ScopeTree } from "./scope-select";

type Section = "check" | "later" | "waiting" | "no_show";
const SECTIONS: { key: Section; title: string; hint: string; tone: string }[] = [
  { key: "check", title: "Check up on", hint: "Should be here by now. Call home, then note what you heard.", tone: "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20" },
  { key: "later", title: "Coming later", hint: "Flag paused until the time given.", tone: "" },
  { key: "waiting", title: "Not here yet", hint: "Nothing unusual yet.", tone: "" },
  { key: "no_show", title: "Not coming", hint: "Marked not coming. Tap “Coming after all” if that changes.", tone: "" },
];
type Dlg = { kind: "later" | "note" | "not_coming"; row: BoardRow } | null;

export function MissingBoard({
  rows,
  followups,
  rules,
  tree,
  defaultScope,
  campLabel,
  canAct,
  templates,
}: {
  rows: BoardRow[];
  followups: Record<string, Followup>;
  rules: MissingRules;
  tree: ScopeTree;
  defaultScope: BoardScope;
  campLabel: string;
  canAct: boolean;
  templates: TemplateButton[];
}) {
  const router = useRouter();
  const [scope, chooseScope] = useScope("kinus:missing-scope", defaultScope, (s) => scopeExists(s, tree), decodeScope);
  const [now, setNow] = React.useState<Date | null>(null);
  const [dlg, setDlg] = React.useState<Dlg>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    setNow(new Date());
    // new arrivals and other people's notes show up by themselves
    const t = setInterval(() => {
      setNow(new Date());
      router.refresh();
    }, 20000);
    return () => clearInterval(t);
  }, [router]);

  const scoped = React.useMemo(() => rows.filter((r) => inScope(r, scope, tree)), [rows, scope, tree]);
  const states = React.useMemo(
    () => (now ? missingStates(scoped, rules, new Map(Object.entries(followups)), now, campClock(now, CAMP_TIME_ZONE)) : new Map<string, MissingState>()),
    [scoped, rules, followups, now],
  );
  const bunkName = React.useMemo(() => new Map(tree.divisions.flatMap((d) => d.bunks.map((b) => [b.id, b.name] as const))), [tree]);
  const divName = React.useMemo(() => new Map(tree.divisions.map((d) => [d.id, d.name] as const)), [tree]);
  const bunkOrder = React.useMemo(() => new Map(tree.divisions.flatMap((d, i) => d.bunks.map((b, j) => [b.id, i * 1000 + j] as const))), [tree]);
  const bySection = React.useMemo(() => {
    const out: Record<Section, BoardRow[]> = { check: [], later: [], waiting: [], no_show: [] };
    for (const r of scoped) {
      if (r.status === "no_show") out.no_show.push(r);
      else if (r.status === "expected") out[states.get(r.id)?.kind ?? "waiting"].push(r);
    }
    const order = (r: BoardRow) => bunkOrder.get(r.bunkId ?? "") ?? 1e9;
    for (const k of Object.keys(out) as Section[]) out[k].sort((a, b) => order(a) - order(b) || a.last.localeCompare(b.last));
    return out;
  }, [scoped, states, bunkOrder]);
  const arrived = scoped.filter((r) => r.status === "present" || r.status === "out" || r.status === "departed").length;
  const expectedTotal = scoped.length - bySection.no_show.length;
  const showPlace = scope.kind !== "bunk";

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      after?.();
      router.refresh();
    });

  const row = (r: BoardRow, section: Section) => {
    const st = states.get(r.id);
    const f = followups[r.id];
    return (
      <li key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
        <button type="button" onClick={() => setOpen(r.id)} className="min-w-0 flex-1 basis-56 text-left">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium hover:underline" dir="auto">
              {r.name}
            </span>
            {r.medical && <AlertTriangle className="size-3.5 shrink-0 text-amber-500" aria-label="Medical flag" />}
          </span>
          <span className="block truncate text-xs text-muted-foreground" dir="auto">
            {showPlace && [r.divisionId ? divName.get(r.divisionId) : null, r.bunkId ? bunkName.get(r.bunkId) : "no bunk"].filter(Boolean).join(" · ")}
            {showPlace && (st?.kind === "check" || section === "later" || section === "no_show") && " · "}
            {st?.kind === "check" && st.reason}
            {st?.kind === "later" && now && `Coming ${formatWhen(st.until, now)}`}
            {section === "no_show" && (r.note ? `“${r.note}”` : "Not coming")}
          </span>
          {f?.note && section !== "no_show" && (
            <span className="mt-0.5 flex items-start gap-1 text-xs" dir="auto">
              <MessageSquare className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              <span>
                {f.note}
                <span className="text-muted-foreground">
                  {" "}
                  · {now ? formatWhen(f.at, now) : ""}
                  {f.by ? ` by ${f.by}` : ""}
                </span>
              </span>
            </span>
          )}
        </button>
        <span className="flex flex-wrap items-center gap-1.5">
          {r.phones.slice(0, 2).map((p, i) => (
            <a key={`${p.label}-${i}`} href={`tel:${p.tel}`} className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted" title={`Call ${p.label}: ${p.phone}`}>
              <Phone className="size-3.5" /> {p.label}
            </a>
          ))}
          {canAct && section !== "no_show" && (
            <>
              <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={() => setDlg({ kind: "note", row: r })}>
                <MessageSquare /> Note
              </Button>
              <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={() => setDlg({ kind: "later", row: r })}>
                <Clock /> Later
              </Button>
              <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={() => setDlg({ kind: "not_coming", row: r })}>
                <UserX /> Not coming
              </Button>
              <Button size="sm" className="h-8 bg-status-present text-white hover:bg-status-present/90" disabled={pending} onClick={() => run(() => checkInNow(r.id))}>
                <UserCheck /> Arrived
              </Button>
            </>
          )}
          {canAct && section === "no_show" && (
            <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={() => run(() => undoNotComing(r.id))}>
              Coming after all
            </Button>
          )}
        </span>
      </li>
    );
  };

  return (
    <div className={cn("space-y-5", pending && "opacity-80")} data-ready={now ? "" : undefined}>
      <div className="flex flex-wrap items-center gap-3">
        <ScopeSelect value={scope} onChange={chooseScope} rows={rows} tree={tree} campLabel={campLabel} />
        <span className="text-sm text-muted-foreground">
          {arrived} of {expectedTotal} arrived
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SECTIONS.map((s) => (
          <a
            key={s.key}
            href={`#${s.key}`}
            className={cn("rounded-xl border bg-card p-3 shadow-[var(--shadow-card)] hover:border-primary/40", s.key === "check" && bySection.check.length > 0 && "border-amber-400 bg-amber-50 dark:bg-amber-950/30")}
          >
            <div className="text-xs font-medium text-muted-foreground">{s.title}</div>
            <div className={cn("mt-0.5 text-2xl font-semibold tabular-nums", s.key === "check" && bySection.check.length > 0 && "text-amber-700 dark:text-amber-300")}>{bySection[s.key].length}</div>
          </a>
        ))}
      </div>
      {expectedTotal > 0 && bySection.check.length + bySection.later.length + bySection.waiting.length === 0 && (
        <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Everyone expected here has arrived.</p>
      )}
      {SECTIONS.map((s) =>
        bySection[s.key].length ? (
          <section key={s.key} id={s.key} className={cn("scroll-mt-20 overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]", s.tone)}>
            <header className="flex flex-wrap items-baseline gap-x-3 border-b px-4 py-2.5">
              <h2 className="font-semibold">
                {s.title} <span className="font-normal text-muted-foreground">({bySection[s.key].length})</span>
              </h2>
              <span className="text-xs text-muted-foreground">{s.hint}</span>
            </header>
            <ul className="divide-y">{bySection[s.key].map((r) => row(r, s.key))}</ul>
          </section>
        ) : null,
      )}

      <FollowupDialog
        dlg={dlg}
        followup={dlg ? followups[dlg.row.id] : undefined}
        onClose={() => setDlg(null)}
        onLater={(id, until, note) => run(() => saveFollowup(id, { until, note }), () => setDlg(null))}
        onNote={(id, note) => run(() => saveFollowup(id, { note }), () => setDlg(null))}
        onClear={(id) => run(() => clearFollowup(id), () => setDlg(null))}
        onNotComing={(id, reason) => run(() => markNotComing(id, reason), () => setDlg(null))}
        pending={pending}
      />
      <Dialog open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>Camper</DialogTitle>
          </DialogHeader>
          {open && <CamperCard camperId={open} templates={templates} canScan={canAct} onAction={() => router.refresh()} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FollowupDialog({
  dlg,
  followup,
  onClose,
  onLater,
  onNote,
  onClear,
  onNotComing,
  pending,
}: {
  dlg: Dlg;
  followup: Followup | undefined;
  onClose: () => void;
  onLater: (id: string, until: string, note: string) => void;
  onNote: (id: string, note: string) => void;
  onClear: (id: string) => void;
  onNotComing: (id: string, reason: string) => void;
  pending: boolean;
}) {
  const [note, setNote] = React.useState("");
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  React.useEffect(() => {
    if (!dlg) return;
    setNote(dlg.kind === "not_coming" ? "" : (followup?.note ?? ""));
    const now = new Date();
    setDate(campToday(now));
    setTime(new Date(now.getTime() + 2 * 3600000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: CAMP_TIME_ZONE }));
  }, [dlg, followup]);
  if (!dlg) return null;
  const id = dlg.row.id;
  const inHours = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
  const tomorrow = campToday(new Date(Date.now() + 24 * 3600000));
  const quick: { label: string; until: string }[] = [
    { label: "In 1 hour", until: inHours(1) },
    { label: "In 2 hours", until: inHours(2) },
    { label: "This evening", until: campDateTimeToIso(campToday(), "18:00") },
    { label: "Tomorrow morning", until: campDateTimeToIso(tomorrow, "09:00") },
  ].filter((q) => new Date(q.until) > new Date());

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle dir="auto">
            {dlg.kind === "later" ? "Coming later" : dlg.kind === "note" ? "Note" : "Not coming"}: {dlg.row.name}
          </DialogTitle>
          <DialogDescription>
            {dlg.kind === "later" && "They stay on the list, but aren't flagged until this time."}
            {dlg.kind === "note" && "What you found out, for everyone who looks after this camper."}
            {dlg.kind === "not_coming" && "They're taken off the not-here-yet list and counted as not coming. You can undo this."}
          </DialogDescription>
        </DialogHeader>
        {dlg.kind === "later" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {quick.map((q) => (
                <Button key={q.label} variant="outline" size="sm" disabled={pending} onClick={() => onLater(id, q.until, note)}>
                  {q.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">Day</span>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
              </label>
              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">Time</span>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 w-32" />
              </label>
              <Button size="sm" disabled={pending || !date || !time} onClick={() => onLater(id, campDateTimeToIso(date, time), note)}>
                Set
              </Button>
            </div>
          </div>
        )}
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={dlg.kind === "not_coming" ? "Why (e.g. sick this week, cancelled)" : "e.g. Called mom: flight lands at 3"}
          aria-label={dlg.kind === "not_coming" ? "Reason" : "Note"}
          dir="auto"
        />
        <DialogFooter className="sm:justify-between">
          {dlg.kind !== "not_coming" && followup ? (
            <Button variant="ghost" className="text-muted-foreground" disabled={pending} onClick={() => onClear(id)}>
              Clear note and time
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {dlg.kind === "note" && (
              <Button disabled={pending || !note.trim()} onClick={() => onNote(id, note)}>
                Save note
              </Button>
            )}
            {dlg.kind === "not_coming" && (
              <Button variant="destructive" disabled={pending} onClick={() => onNotComing(id, note)}>
                Not coming
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
