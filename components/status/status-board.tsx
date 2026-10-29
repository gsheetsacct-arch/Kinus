"use client";
import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, MessageSquare, Phone, Radio, Search, UserCheck, UserX, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import { campClock, missingStates, type CampStart, type DivisionCount, type Followup, type MissingRules } from "@/lib/attendance/missing";
import { boardChanges, bulkAttendance } from "@/app/(app)/status/actions";
import { checkInNow, clearFollowup, markNotComing, saveFollowup, undoNotComing } from "@/app/(app)/missing/actions";
import { FollowupDialog, type FollowupDlg } from "./followup-dialog";

type Tree = { groups: { id: string; name: string }[]; divisions: { id: string; name: string; group_id: string | null; bunks: { id: string; name: string }[] }[] };

// the views at the top: a row of small counts, each one a filter
type View = CamperStatus | "check" | "later" | "";
const VIEWS: { view: View; label: string }[] = [
  { view: "present", label: STATUS_LABEL.present },
  { view: "out", label: "Out" },
  { view: "expected", label: STATUS_LABEL.expected },
  { view: "check", label: "Check up" },
  { view: "later", label: "Coming later" },
  { view: "departed", label: STATUS_LABEL.departed },
  { view: "no_show", label: STATUS_LABEL.no_show },
  { view: "", label: "Everyone" },
];
const ONLY: Record<string, string> = { medical: "Medical flag", no_bunk: "No bunk yet", note: "With a follow-up note" };
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
const eventLabel = (r: Pick<BoardRow, "type" | "note">) => (isUndo(r) ? "Undone" : r.type ? EVENT_LABEL[r.type] : "");

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

/**
 * Who's here, and who isn't yet: every camper in a place, live. The counts at the top filter
 * the list (here, out, not here yet, check up on, coming later…); campers not here yet can be
 * followed up from their row (a note, coming later, not coming, check in).
 */
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
  ruleText,
  campStarted: started,
  divisionCounts,
  followups,
  linkScope,
  linkView,
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
  /** When a camper is flagged "check up", in words. */
  ruleText?: string;
  /** Someone in the session has arrived (session-wide). */
  campStarted: CampStart;
  /** Each division's arrivals for the whole session, so the share is the division's, not just what's on screen. */
  divisionCounts?: Record<string, DivisionCount>;
  followups: Record<string, Followup>;
  /** Opened from a link (Home tiles and cards): this place and view. */
  linkScope?: BoardScope | null;
  linkView?: View;
  /** Following up (notes, coming later, not coming) is for head staff; counselors see the flags. */
  canFollowUp?: boolean;
}) {
  const [rows, setRows] = React.useState(initialRows);
  const [scope, chooseScopeRaw] = useScope(SCOPE_KEY, defaultScope, (x) => scopeExists(x, tree) && (x.kind === "all" || rows.some((r) => inScope(r, x, tree))), decodeScope, linkScope);
  const [view, setView] = React.useState<View>(linkView ?? "present");
  const [only, setOnly] = React.useState("");
  const [sort, setSort] = React.useState<"name" | "recent">("name");
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState<string | null>(null);
  const [bulk, setBulk] = React.useState<{ action: (typeof BULK)[number]; ids: string[] } | null>(null);
  const [dlg, setDlg] = React.useState<FollowupDlg>(null);
  const [pending, start] = React.useTransition();
  const [live, setLive] = React.useState(false);
  const [updated, setUpdated] = React.useState(serverNow);
  const since = React.useRef(serverNow);
  const { now, ready } = useNow(serverNow);
  React.useEffect(() => setRows(initialRows), [initialRows]);
  const canAct = canScan && canFollowUp;

  const chooseScope = (v: string) => {
    chooseScopeRaw(v);
    setSelected(new Set());
  };
  const chooseView = (v: View) => {
    setView((cur) => (cur === v ? "" : v));
    setSelected(new Set());
    // a link (?status=…) is a starting point: keep the address bar the page's own
    try {
      const sp = new URLSearchParams(window.location.search);
      sp.delete("status");
      window.history.replaceState(window.history.state, "", window.location.pathname + (sp.size ? `?${sp}` : ""));
    } catch {}
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
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), 60000);
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      after?.();
      refresh();
      router.refresh();
    });

  const index = React.useMemo(() => new Map(rows.map((r) => [r.id, searchEntry(r.name, r.code, r.phones.map((p) => p.tel), r.buzzer)])), [rows]);
  const scoped = React.useMemo(() => rows.filter((r) => inScope(r, scope, tree)), [rows, scope, tree]);
  const counts = countStatuses(scoped);
  // who should be checked up on, recomputed as check-ins arrive
  // measured on every camper this person sees (whole divisions), counted for the part on screen
  const flags = React.useMemo(
    () => missingStates(rows, rules, new Map(Object.entries(followups)), now, campClock(now, CAMP_TIME_ZONE), started, divisionCounts),
    [rows, rules, followups, now, started, divisionCounts],
  );
  const kindOf = React.useCallback((r: BoardRow) => (r.status === "expected" ? (flags.get(r.id)?.kind ?? "waiting") : null), [flags]);
  const count = (v: View) => (v === "" ? counts.total : v === "check" || v === "later" ? scoped.filter((r) => kindOf(r) === v).length : counts[v]);
  const shown = React.useMemo(() => {
    const out = scoped.filter(
      (r) =>
        (!view || (view === "check" || view === "later" ? kindOf(r) === view : r.status === view)) &&
        (!only || (only === "medical" ? r.medical : only === "no_bunk" ? !r.bunkId : Boolean(followups[r.id]?.note))) &&
        (!q.trim() || matchScore(index.get(r.id)!, q) > 0),
    );
    // not here yet: the ones to check up on first, then coming later, then the rest
    const urgency = (r: BoardRow) => ({ check: 0, later: 1, waiting: 2 })[kindOf(r) ?? "waiting"] ?? 3;
    return out.sort((a, b) => (sort === "recent" ? (b.at ?? "").localeCompare(a.at ?? "") : 0) || urgency(a) - urgency(b) || a.last.localeCompare(b.last) || a.name.localeCompare(b.name));
  }, [scoped, view, only, q, index, sort, kindOf, followups]);
  const groups = groupRows(shown, scope, tree);
  const groupTotals = React.useMemo(() => new Map(groupRows(scoped, scope, tree).map((g) => [g.key, g.counts])), [scoped, scope, tree]);
  const filtered = Boolean(view || only || q);

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
    <div className={cn("space-y-3 pb-24", pending && "opacity-80")} data-ready={ready ? "" : undefined}>
      <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-2">
        <ScopeSelect value={scope} onChange={chooseScope} rows={rows} tree={tree} campLabel={campLabel} />
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={live ? "Updates appear by themselves" : "Checking for updates every 15 seconds"}>
          <Radio className={cn("size-3.5", live ? "text-status-present" : "text-muted-foreground")} />
          {live ? "Live" : "Auto-updating"}
          {` · ${formatWhen(updated, now)}`}
        </span>
      </div>

      {/* the counts, small: each one shows just those campers */}
      <div className="no-print -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Show">
        {VIEWS.map((v) => {
          const n = count(v.view);
          const alert = v.view === "check" && n > 0;
          if ((v.view === "check" || v.view === "later" || v.view === "departed" || v.view === "no_show" || v.view === "out") && !n && view !== v.view) return null;
          return (
            <button
              key={v.view || "all"}
              type="button"
              onClick={() => chooseView(v.view)}
              aria-pressed={view === v.view}
              title={v.view === "check" && ruleText ? `Flagged once ${ruleText}` : undefined}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 text-sm transition-colors hover:border-primary/40",
                alert && "border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100",
                view === v.view && "border-primary bg-primary text-primary-foreground hover:border-primary",
              )}
            >
              {alert && <AlertTriangle className="size-3.5" />}
              {v.label}
              <span className={cn("font-semibold tabular-nums", view !== v.view && !alert && "text-muted-foreground")}>
                {n}
                {v.view === "present" && <span className="font-normal opacity-70">/{counts.total - counts.departed - counts.no_show}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="no-print grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative col-span-2 sm:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a camper" className="h-9 pl-9 pr-9" dir="auto" aria-label="Find a camper" />
          {q && (
            <button type="button" onClick={() => setQ("")} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-muted-foreground hover:bg-muted" aria-label="Clear">
              <X className="size-4" />
            </button>
          )}
        </div>
        <Select value={only} onChange={(e) => setOnly(e.target.value)} className="h-9" aria-label="Only">
          <option value="">Every camper</option>
          {Object.entries(ONLY).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as "name" | "recent")} className="h-9" aria-label="Sort">
          <option value="name">By name</option>
          <option value="recent">Latest change first</option>
        </Select>
      </div>
      {filtered && (
        <p className="text-sm text-muted-foreground">
          Showing {shown.length} of {scoped.length}.{" "}
          <button
            type="button"
            className="-my-2 py-2 text-primary hover:underline"
            onClick={() => {
              setView("");
              setOnly("");
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
              {(expanded.has(g.key) || q.trim() ? g.rows : g.rows.slice(0, ROWS_PER_GROUP)).map((r) => {
                const st = flags.get(r.id);
                const f = followups[r.id];
                const waiting = r.status === "expected";
                return (
                  <li key={r.id} className={cn("flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-2.5", selected.has(r.id) && "bg-primary-soft/40", st?.kind === "check" && "bg-amber-50/60 dark:bg-amber-950/20")}>
                    {canBulk && <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={selected.has(r.id)} onChange={(e) => toggle([r.id], e.target.checked)} aria-label={`Select ${r.name}`} />}
                    <button type="button" onClick={() => setOpen(r.id)} className="min-w-0 flex-1 basis-48 text-left">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium hover:underline" dir="auto">
                          {r.name}
                        </span>
                        {r.medical && <AlertTriangle className="size-3.5 shrink-0 text-amber-500" aria-label="Medical flag" />}
                        {st?.kind === "check" && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">check up</span>}
                        {st?.kind === "later" && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">coming {ready ? formatWhen(st.until, now) : "later"}</span>}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground" dir="auto">
                        {st?.kind === "check" ? st.reason : r.at ? `${formatWhen(r.at, now)} · ${eventLabel(r)}${r.by ? ` by ${r.by}` : ""}` : "Not checked in yet"}
                        {r.note && !isUndo(r) && <span dir="auto"> · “{r.note}”</span>}
                        <span className="font-mono"> · {r.code}</span>
                      </span>
                      {f?.note && (waiting || r.status === "no_show") && (
                        <span className="mt-0.5 flex items-start gap-1 text-xs" dir="auto">
                          <MessageSquare className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                          <span>
                            {f.note}
                            <span className="text-muted-foreground">
                              {" "}
                              · {formatWhen(f.at, now)}
                              {f.by ? ` by ${f.by}` : ""}
                            </span>
                          </span>
                        </span>
                      )}
                    </button>
                    <span className="flex flex-wrap items-center justify-end gap-1.5">
                      {r.phones.slice(0, 2).map((p, i) => (
                        <a key={`${p.label}-${i}`} href={`tel:${p.tel}`} className="inline-flex h-9 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted sm:h-7" title={`Call ${p.label}: ${formatPhone(p.phone)}`}>
                          <Phone className="size-3" /> {p.label}
                          <span className="hidden text-muted-foreground lg:inline">{formatPhone(p.phone)}</span>
                        </a>
                      ))}
                      {canAct && waiting && (
                        <>
                          <Button size="sm" variant="outline" className="h-9 sm:h-7" disabled={pending} onClick={() => setDlg({ kind: "note", row: r })} title="A note: what you found out">
                            <MessageSquare /> <span className="sr-only sm:not-sr-only">Note</span>
                          </Button>
                          <Button size="sm" variant="outline" className="h-9 sm:h-7" disabled={pending} onClick={() => setDlg({ kind: "later", row: r })} title="Coming later: no check-up flag until then">
                            <Clock /> <span className="sr-only sm:not-sr-only">Later</span>
                          </Button>
                          <Button size="sm" variant="outline" className="h-9 sm:h-7" disabled={pending} onClick={() => setDlg({ kind: "not_coming", row: r })} title="Not coming">
                            <UserX /> <span className="sr-only sm:not-sr-only">Not coming</span>
                          </Button>
                          <Button size="sm" className="h-9 bg-status-present text-white hover:bg-status-present/90 sm:h-7" disabled={pending} onClick={() => run(() => checkInNow(r.id))}>
                            <UserCheck /> Check in
                          </Button>
                        </>
                      )}
                      {canAct && r.status === "no_show" && (
                        <Button size="sm" variant="outline" className="h-9 sm:h-7" disabled={pending} onClick={() => run(() => undoNotComing(r.id))}>
                          Coming after all
                        </Button>
                      )}
                      {!(canAct && (waiting || r.status === "no_show")) && <StatusBadge status={r.status} />}
                    </span>
                  </li>
                );
              })}
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
      {!groups.length && (
        <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {!rows.length ? "No campers here yet." : view === "present" && !q && !only ? "Nobody has checked in here yet." : view === "expected" && !q && !only ? "Everyone expected here has arrived." : "Nobody matches."}
        </p>
      )}

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
