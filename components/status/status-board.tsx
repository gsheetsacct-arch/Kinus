"use client";
import * as React from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, Phone, Radio, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { CamperCard, type TemplateButton } from "@/components/scan/camper-card";
import { countStatuses, decodeScope, groupRows, inScope, scopeExists, type BoardScope } from "@/lib/attendance/board";
import { ScopeSelect, useScope } from "./scope-select";
import { EVENT_LABEL, STATUS_LABEL, nextStatus, type AttendanceEventType, type CamperStatus } from "@/lib/attendance/machine";
import type { BoardRow } from "@/lib/data/board";
import { matchScore, searchEntry } from "@/lib/search";
import { createClient } from "@/lib/supabase/client";
import { CAMP_TIME_ZONE, cn, formatPhone, formatWhen } from "@/lib/utils";
import { campClock, missingStates, type Followup, type MissingRules } from "@/lib/attendance/missing";
import { boardChanges, bulkAttendance } from "@/app/(app)/status/actions";

type Tree = { groups: { id: string; name: string }[]; divisions: { id: string; name: string; group_id: string | null; bunks: { id: string; name: string }[] }[] };

const TILES: { status: CamperStatus; label: string; tone: string }[] = [
  { status: "present", label: STATUS_LABEL.present, tone: "text-status-present" },
  { status: "out", label: STATUS_LABEL.out, tone: "text-amber-600 dark:text-amber-400" },
  { status: "expected", label: STATUS_LABEL.expected, tone: "text-muted-foreground" },
  { status: "departed", label: STATUS_LABEL.departed, tone: "text-status-departed" },
  { status: "no_show", label: STATUS_LABEL.no_show, tone: "text-status-no-show" },
];
const BULK: { event: AttendanceEventType; label: string; danger?: boolean }[] = [
  { event: "arrival", label: "Check in" },
  { event: "leave", label: "Out · coming back" },
  { event: "return", label: "Back in" },
  { event: "pickup", label: "Not coming back", danger: true },
  { event: "no_show", label: "Not coming", danger: true },
];
const ROWS_PER_GROUP = 40;
/** Above this many campers, a "not coming" change asks for the number to be typed. */
const TYPE_TO_CONFIRM = 20;
const SCOPE_KEY = "kinus:board-scope";
// undo_attendance() records a correction with the note "Undo"
const isUndo = (r: Pick<BoardRow, "type" | "note">) => r.type === "correction" && r.note === "Undo";
const eventLabel = (r: Pick<BoardRow, "type" | "note">) => (isUndo(r) ? "Check-in undone" : r.type ? EVENT_LABEL[r.type] : "");

/** Times differ between server and phone until the page is live: render them after mount. */
function useNow(serverNow: string) {
  const [now, setNow] = React.useState<Date>(() => new Date(serverNow));
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    setNow(new Date());
    setReady(true);
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return { now, ready };
}

export function StatusBoard({
  rows: initialRows,
  tree,
  defaultScope,
  campLabel,
  serverNow,
  canBulk,
  canScan,
  templates,
  rules,
  campStarted: started,
  followups,
  linkScope,
  linkStatus,
  canFollowUp = true,
}: {
  rows: BoardRow[];
  tree: Tree;
  defaultScope: BoardScope;
  campLabel: string;
  serverNow: string;
  canBulk: boolean;
  canScan: boolean;
  templates: TemplateButton[];
  rules: MissingRules;
  /** Someone in the session has arrived (session-wide). */
  campStarted: boolean;
  followups: Record<string, Followup>;
  /** Opened from a link (Home tiles and cards): this place and status. */
  linkScope?: BoardScope | null;
  linkStatus?: CamperStatus | "";
  /** Counselors can't open Not here yet: the banner is just information for them. */
  canFollowUp?: boolean;
}) {
  const [rows, setRows] = React.useState(initialRows);
  const [scope, chooseScopeRaw] = useScope(SCOPE_KEY, defaultScope, (x) => scopeExists(x, tree), decodeScope, linkScope);
  const [status, setStatus] = React.useState<CamperStatus | "">(linkStatus ?? "present");
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState<string | null>(null);
  const [bulk, setBulk] = React.useState<{ action: (typeof BULK)[number]; ids: string[] } | null>(null);
  const [live, setLive] = React.useState(false);
  const [updated, setUpdated] = React.useState(serverNow);
  const since = React.useRef(serverNow);
  const { now, ready } = useNow(serverNow);
  React.useEffect(() => setRows(initialRows), [initialRows]);

  const chooseScope = (v: string) => {
    chooseScopeRaw(v);
    setSelected(new Set());
  };

  // live: a push from the database when anyone checks a camper in or out, plus a slow poll as a safety net
  const refresh = React.useCallback(async () => {
    try {
      const { changes, now, cursor } = await boardChanges(since.current);
      since.current = cursor;
      setUpdated(now);
      if (!changes.length) return;
      const byId = new Map(changes.map((c) => [c.id, c]));
      setRows((cur) => cur.map((r) => (byId.has(r.id) ? { ...r, ...byId.get(r.id)! } : r)));
    } catch {
      // offline for a moment: the next tick catches up
    }
  }, []);
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 400);
    };
    const supabase = createClient();
    const channel = supabase
      .channel("status-board")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "attendance_events" }, soon)
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  React.useEffect(() => {
    const t = setInterval(refresh, live ? 60000 : 15000);
    return () => clearInterval(t);
  }, [refresh, live]);
  // and a full reload of the board's data now and then: walk-ins, bunk moves, "coming later"
  // notes and rule changes aren't check-ins, so the quick updates above don't carry them
  const router = useRouter();
  React.useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), 90000);
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  const index = React.useMemo(() => new Map(rows.map((r) => [r.id, searchEntry(r.name, r.code, r.phones.map((p) => p.tel))])), [rows]);
  const scoped = React.useMemo(() => rows.filter((r) => inScope(r, scope, tree)), [rows, scope, tree]);
  const counts = countStatuses(scoped);
  // who should be checked up on, recomputed as check-ins arrive
  const flags = React.useMemo(() => missingStates(scoped, rules, new Map(Object.entries(followups)), now, campClock(now, CAMP_TIME_ZONE), started), [scoped, rules, followups, now, started]);
  const toCheck = [...flags.values()].filter((f) => f.kind === "check").length;
  const shown = React.useMemo(() => {
    const out = scoped.filter((r) => (!status || r.status === status) && (!q.trim() || matchScore(index.get(r.id)!, q) > 0));
    return out.sort((a, b) => a.last.localeCompare(b.last) || a.name.localeCompare(b.name));
  }, [scoped, status, q, index]);
  const groups = groupRows(shown, scope, tree);
  const groupTotals = React.useMemo(() => new Map(groupRows(scoped, scope, tree).map((g) => [g.key, g.counts])), [scoped, scope, tree]);

  // only the changes that apply to the campers picked, each with how many it would change
  const bulkOptions = React.useMemo(() => {
    const picked = rows.filter((r) => selected.has(r.id));
    return BULK.map((action) => ({ action, ids: picked.filter((r) => nextStatus(r.status, action.event) !== null).map((r) => r.id) })).filter((o) => o.ids.length > 0);
  }, [rows, selected]);

  const toggle = (ids: string[], on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  return (
    <div className="space-y-4 pb-24" data-ready={ready ? "" : undefined}>
      <div className="no-print flex flex-wrap items-center gap-3">
        <ScopeSelect value={scope} onChange={chooseScope} rows={rows} tree={tree} campLabel={campLabel} />
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={live ? "Updates appear by themselves" : "Checking for updates every 15 seconds"}>
          <Radio className={cn("size-3.5", live ? "text-status-present" : "text-muted-foreground")} />
          {live ? "Live" : "Auto-updating"}
          {` · ${formatWhen(updated, now)}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {TILES.map((t) => (
          <button
            key={t.status}
            type="button"
            onClick={() => setStatus((s) => (s === t.status ? "" : t.status))}
            aria-pressed={status === t.status}
            className={cn(
              "rounded-xl border bg-card p-3 text-left shadow-[var(--shadow-card)] transition-colors hover:border-primary/40",
              status === t.status && "border-primary ring-2 ring-primary/30",
              t.status === "present" && "col-span-2 sm:col-span-1",
            )}
          >
            <div className="text-xs font-medium text-muted-foreground">{t.label}</div>
            <div className={cn("mt-0.5 text-2xl font-semibold tabular-nums", t.tone)}>
              {counts[t.status]}
              {t.status === "present" && <span className="text-sm font-normal text-muted-foreground"> / {counts.total - counts.departed - counts.no_show}</span>}
            </div>
          </button>
        ))}
      </div>

      {toCheck > 0 &&
        (canFollowUp ? (
          <Link href="/missing" className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="size-4 shrink-0" />
            <span className="flex-1">
              <strong>{toCheck}</strong> {toCheck === 1 ? "camper" : "campers"} to check up on: still not here when they should be.
            </span>
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <p className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              <strong>{toCheck}</strong> {toCheck === 1 ? "camper" : "campers"} still not here when they should be (marked “check up”). Your head counselor is following up.
            </span>
          </p>
        ))}

      <div className="no-print relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a camper on this board" className="pl-9 pr-9" dir="auto" aria-label="Find a camper on this board" />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Clear">
            <X className="size-4" />
          </button>
        )}
      </div>
      {(status || q) && (
        <p className="text-sm text-muted-foreground">
          Showing {shown.length} of {scoped.length}
          {status && ` · ${TILES.find((t) => t.status === status)?.label.toLowerCase()}`}.{" "}
          <button
            type="button"
            className="-my-2 py-2 text-primary hover:underline"
            onClick={() => {
              setStatus("");
              setQ("");
            }}
          >
            Show everyone
          </button>
        </p>
      )}

      {groups.map((g) => {
        const total = groupTotals.get(g.key) ?? g.counts;
        const ids = g.rows.map((r) => r.id);
        const allOn = canBulk && ids.every((id) => selected.has(id));
        const expectedHere = total.total - total.departed - total.no_show;
        return (
          <section key={g.key} className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-4 py-2.5">
              {canBulk && <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={allOn} onChange={(e) => toggle(ids, e.target.checked)} aria-label={`Select all ${ids.length} shown in ${g.title}`} title={`Select all ${ids.length} shown`} />}
              <h2 className="font-semibold" dir="auto">
                {g.title}
              </h2>
              <span className="text-sm text-muted-foreground">
                {total.present} of {expectedHere} here
                {total.out > 0 && ` · ${total.out} out`}
                {total.expected > 0 && ` · ${total.expected} not yet`}
                {total.departed > 0 && ` · ${total.departed} not coming back`}
              </span>
              <span className="ml-auto hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
                <span className="block h-full bg-status-present" style={{ width: `${expectedHere ? (100 * total.present) / expectedHere : 0}%` }} />
              </span>
            </header>
            <ul className="divide-y">
              {(expanded.has(g.key) || q.trim() ? g.rows : g.rows.slice(0, ROWS_PER_GROUP)).map((r) => (
                <li key={r.id} className={cn("flex items-start gap-3 px-4 py-2.5", selected.has(r.id) && "bg-primary-soft/40")}>
                  {canBulk && <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={selected.has(r.id)} onChange={(e) => toggle([r.id], e.target.checked)} aria-label={`Select ${r.name}`} />}
                  <button type="button" onClick={() => setOpen(r.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium hover:underline" dir="auto">
                        {r.name}
                      </span>
                      {r.medical && <AlertTriangle className="size-3.5 shrink-0 text-amber-500" aria-label="Medical flag" />}
                      {flags.get(r.id)?.kind === "check" && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">check up</span>}
                      {flags.get(r.id)?.kind === "later" && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">coming later</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.at ? `${formatWhen(r.at, now)} · ${eventLabel(r)}${r.by ? ` by ${r.by}` : ""}` : r.at ? " " : "Not checked in yet"}
                      {r.note && !isUndo(r) && <span dir="auto"> · “{r.note}”</span>}
                      <span className="font-mono"> · {r.code}</span>
                    </span>
                  </button>
                  <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row-reverse sm:items-center sm:gap-2">
                    <StatusBadge status={r.status} />
                    {r.phones.length > 0 && (
                      <span className="flex gap-1">
                        {r.phones.slice(0, 2).map((p, i) => (
                          <a key={`${p.label}-${i}`} href={`tel:${p.tel}`} className="inline-flex h-9 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted sm:h-7" title={`Call ${p.label}: ${formatPhone(p.phone)}`}>
                            <Phone className="size-3" /> {p.label}
                            <span className="hidden text-muted-foreground lg:inline">{formatPhone(p.phone)}</span>
                          </a>
                        ))}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {/* a whole camp is hundreds of rows: draw a bunk's first ones, the rest on request (phones stay quick) */}
            {!expanded.has(g.key) && !q.trim() && g.rows.length > ROWS_PER_GROUP && (
              <button type="button" className="w-full border-t py-3 text-sm font-medium text-primary hover:bg-muted/50" onClick={() => setExpanded((x) => new Set(x).add(g.key))}>
                Show all {g.rows.length}
              </button>
            )}
          </section>
        );
      })}
      {!groups.length && <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">{!rows.length ? "No campers here yet." : status === "present" && !q ? "Nobody has checked in here yet." : "Nobody matches."}</p>}

      {canBulk && selected.size > 0 && (
        <div className="no-print fixed inset-x-0 bottom-16 z-40 px-3 md:bottom-4 md:left-64">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 rounded-xl border bg-card p-2 pl-4 shadow-lg">
            <span className="mr-auto text-sm font-medium">{selected.size} selected</span>
            {bulkOptions.map((o) => (
              <Button key={o.action.event} size="sm" variant="outline" className={cn(o.action.danger && "border-destructive/40 text-destructive hover:bg-destructive/10")} onClick={() => setBulk(o)}>
                {o.action.label} ({o.ids.length})
              </Button>
            ))}
            {!bulkOptions.length && <span className="text-sm text-muted-foreground">Nothing applies to all of these.</span>}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <Dialog open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>Camper</DialogTitle>
          </DialogHeader>
          {open && <CamperCard camperId={open} templates={templates} canScan={canScan} onAction={() => refresh()} />}
        </DialogContent>
      </Dialog>
      <BulkConfirm
        action={bulk?.action ?? null}
        count={bulk?.ids.length ?? 0}
        onClose={() => setBulk(null)}
        onConfirm={async (note) => {
          if (!bulk) return;
          const r = await bulkAttendance(bulk.ids, bulk.action.event, note);
          if (!r.ok) return void toast.error(r.error);
          toast.success(`${bulk.action.label}: ${r.done} done${r.skipped ? `, ${r.skipped} skipped (already in that state)` : ""}.`);
          setSelected(new Set());
          setBulk(null);
          refresh();
        }}
      />
    </div>
  );
}

function BulkConfirm({ action, count, onClose, onConfirm }: { action: (typeof BULK)[number] | null; count: number; onClose: () => void; onConfirm: (note: string) => Promise<void> }) {
  const [note, setNote] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [pending, start] = React.useTransition();
  React.useEffect(() => {
    setNote("");
    setTyped("");
  }, [action]);
  const mustType = Boolean(action?.danger) && count > TYPE_TO_CONFIRM;
  return (
    <Dialog open={Boolean(action)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action?.label}: {count} {count === 1 ? "camper" : "campers"}?
          </DialogTitle>
          <DialogDescription>
            {action?.danger
              ? "This can't be undone in one step: each camper would need correcting one by one. Each change shows your name in their timeline."
              : "Campers already in that state are skipped. Each change shows your name in their timeline."}
          </DialogDescription>
        </DialogHeader>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. Bus 3" aria-label="Note" dir="auto" />
        {mustType && (
          <label className="space-y-1.5 text-sm">
            <span className="block font-medium">Type {count} to confirm</span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" autoComplete="off" />
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={action?.danger ? "destructive" : "default"} disabled={pending || (mustType && typed.trim() !== String(count))} onClick={() => start(() => onConfirm(note))}>
            {pending ? "Working…" : action?.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
