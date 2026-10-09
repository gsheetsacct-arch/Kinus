"use client";
import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Phone, Radio, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { CamperCard, type TemplateButton } from "@/components/scan/camper-card";
import { countStatuses, decodeScope, encodeScope, groupRows, inScope, scopeExists, type BoardScope } from "@/lib/attendance/board";
import { EVENT_LABEL, type AttendanceEventType, type CamperStatus } from "@/lib/attendance/machine";
import type { BoardRow } from "@/lib/data/board";
import { matchScore, searchEntry } from "@/lib/search";
import { createClient } from "@/lib/supabase/client";
import { cn, formatWhen } from "@/lib/utils";
import { boardChanges, bulkAttendance } from "@/app/(app)/status/actions";

type Tree = { groups: { id: string; name: string }[]; divisions: { id: string; name: string; group_id: string | null; bunks: { id: string; name: string }[] }[] };

const TILES: { status: CamperStatus; label: string; tone: string }[] = [
  { status: "present", label: "Here", tone: "text-status-present" },
  { status: "out", label: "Out, coming back", tone: "text-amber-600 dark:text-amber-400" },
  { status: "expected", label: "Not here yet", tone: "text-muted-foreground" },
  { status: "departed", label: "Went home", tone: "text-status-departed" },
  { status: "no_show", label: "No-show", tone: "text-status-no-show" },
];
const BULK: { event: AttendanceEventType; label: string }[] = [
  { event: "arrival", label: "Check in" },
  { event: "leave", label: "Out · coming back" },
  { event: "return", label: "Back in" },
  { event: "pickup", label: "Going home" },
  { event: "no_show", label: "No-show" },
];
const SCOPE_KEY = "kinus:board-scope";
// undo_attendance() records a correction with the note "Undo"
const isUndo = (r: Pick<BoardRow, "type" | "note">) => r.type === "correction" && r.note === "Undo";
const eventLabel = (r: Pick<BoardRow, "type" | "note">) => (isUndo(r) ? "Check-in undone" : r.type ? EVENT_LABEL[r.type] : "");

/** Times differ between server and phone until the page is live: render them after mount. */
function useNow() {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
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
}: {
  rows: BoardRow[];
  tree: Tree;
  defaultScope: BoardScope;
  campLabel: string;
  serverNow: string;
  canBulk: boolean;
  canScan: boolean;
  templates: TemplateButton[];
}) {
  const [rows, setRows] = React.useState(initialRows);
  const [scope, setScope] = React.useState<BoardScope>(defaultScope);
  const [status, setStatus] = React.useState<CamperStatus | "">("");
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState<string | null>(null);
  const [bulk, setBulk] = React.useState<(typeof BULK)[number] | null>(null);
  const [live, setLive] = React.useState(false);
  const [updated, setUpdated] = React.useState(serverNow);
  const since = React.useRef(serverNow);
  const now = useNow();
  React.useEffect(() => setRows(initialRows), [initialRows]);

  // remembered view on this device (if it still exists)
  React.useEffect(() => {
    try {
      const s = decodeScope(localStorage.getItem(SCOPE_KEY));
      if (s && scopeExists(s, tree)) setScope(s);
    } catch {}
  }, [tree]);
  const chooseScope = (v: string) => {
    const s = decodeScope(v) ?? { kind: "all" };
    setScope(s);
    setSelected(new Set());
    try {
      localStorage.setItem(SCOPE_KEY, v);
    } catch {}
  };

  // live: a push from the database when anyone checks a camper in or out, plus a slow poll as a safety net
  const refresh = React.useCallback(async () => {
    try {
      const { changes, now } = await boardChanges(since.current);
      since.current = now;
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

  const index = React.useMemo(() => new Map(rows.map((r) => [r.id, searchEntry(r.name, r.code, r.phones.map((p) => p.tel))])), [rows]);
  const scoped = React.useMemo(() => rows.filter((r) => inScope(r, scope, tree)), [rows, scope, tree]);
  const counts = countStatuses(scoped);
  const shown = React.useMemo(() => {
    const out = scoped.filter((r) => (!status || r.status === status) && (!q.trim() || matchScore(index.get(r.id)!, q) > 0));
    return out.sort((a, b) => a.last.localeCompare(b.last) || a.name.localeCompare(b.name));
  }, [scoped, status, q, index]);
  const groups = groupRows(shown, scope, tree);
  const groupTotals = React.useMemo(() => new Map(groupRows(scoped, scope, tree).map((g) => [g.key, g.counts])), [scoped, scope, tree]);

  const toggle = (ids: string[], on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  // scope choices: only places that have campers this person can see
  const withCampers = React.useMemo(() => {
    const d = new Set(rows.map((r) => r.divisionId));
    const b = new Set(rows.map((r) => r.bunkId));
    return { d, b };
  }, [rows]);
  const divisions = tree.divisions.filter((d) => withCampers.d.has(d.id));
  const camps = tree.groups.filter((g) => divisions.some((d) => d.group_id === g.id));

  return (
    <div className="space-y-4 pb-24" data-ready={now ? "" : undefined}>
      <div className="no-print flex flex-wrap items-center gap-3">
        <Select value={encodeScope(scope)} onChange={(e) => chooseScope(e.target.value)} aria-label="Show" className="w-auto min-w-56 max-w-full font-medium">
          <option value="all">{campLabel}</option>
          {camps.length > 1 &&
            camps.map((g) => (
              <option key={g.id} value={encodeScope({ kind: "group", id: g.id })}>
                {g.name} camp
              </option>
            ))}
          {divisions.map((d) => (
            <optgroup key={d.id} label={d.name}>
              <option value={encodeScope({ kind: "division", id: d.id })}>All of {d.name}</option>
              {d.bunks
                .filter((b) => withCampers.b.has(b.id))
                .map((b) => (
                  <option key={b.id} value={encodeScope({ kind: "bunk", divisionId: d.id, id: b.id })}>
                    {b.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={live ? "Updates appear by themselves" : "Checking for updates every 15 seconds"}>
          <Radio className={cn("size-3.5", live ? "text-status-present" : "text-muted-foreground")} />
          {live ? "Live" : "Auto-updating"}
          {now && ` · ${formatWhen(updated, now)}`}
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
            className="text-primary hover:underline"
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
              {canBulk && <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={allOn} onChange={(e) => toggle(ids, e.target.checked)} aria-label={`Select everyone in ${g.title}`} />}
              <h2 className="font-semibold" dir="auto">
                {g.title}
              </h2>
              <span className="text-sm text-muted-foreground">
                {total.present} of {expectedHere} here
                {total.out > 0 && ` · ${total.out} out`}
                {total.expected > 0 && ` · ${total.expected} not yet`}
                {total.departed > 0 && ` · ${total.departed} went home`}
              </span>
              <span className="ml-auto hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
                <span className="block h-full bg-status-present" style={{ width: `${expectedHere ? (100 * total.present) / expectedHere : 0}%` }} />
              </span>
            </header>
            <ul className="divide-y">
              {g.rows.map((r) => (
                <li key={r.id} className={cn("flex items-start gap-3 px-4 py-2.5", selected.has(r.id) && "bg-primary-soft/40")}>
                  {canBulk && <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={selected.has(r.id)} onChange={(e) => toggle([r.id], e.target.checked)} aria-label={`Select ${r.name}`} />}
                  <button type="button" onClick={() => setOpen(r.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium hover:underline" dir="auto">
                        {r.name}
                      </span>
                      {r.medical && <AlertTriangle className="size-3.5 shrink-0 text-amber-500" aria-label="Medical flag" />}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.at && now ? `${formatWhen(r.at, now)} · ${eventLabel(r)}${r.by ? ` by ${r.by}` : ""}` : r.at ? " " : "Not checked in yet"}
                      {r.note && !isUndo(r) && <span dir="auto"> · “{r.note}”</span>}
                    </span>
                  </button>
                  <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row-reverse sm:items-center sm:gap-2">
                    <StatusBadge status={r.status} />
                    {r.phones.length > 0 && (
                      <span className="flex gap-1">
                        {r.phones.slice(0, 2).map((p, i) => (
                          <a key={`${p.label}-${i}`} href={`tel:${p.tel}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted" title={`Call ${p.label}: ${p.phone}`}>
                            <Phone className="size-3" /> {p.label}
                          </a>
                        ))}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {!groups.length && <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">{rows.length ? "Nobody matches." : "No campers here yet."}</p>}

      {canBulk && selected.size > 0 && (
        <div className="no-print fixed inset-x-0 bottom-16 z-40 px-3 md:bottom-4 md:left-64">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 rounded-xl border bg-card p-2 pl-4 shadow-lg">
            <span className="mr-auto text-sm font-medium">{selected.size} selected</span>
            {BULK.map((b) => (
              <Button key={b.event} size="sm" variant="outline" onClick={() => setBulk(b)}>
                {b.label}
              </Button>
            ))}
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
        action={bulk}
        count={selected.size}
        onClose={() => setBulk(null)}
        onConfirm={async (note) => {
          if (!bulk) return;
          const r = await bulkAttendance([...selected], bulk.event, note);
          if (!r.ok) return void toast.error(r.error);
          toast.success(`${bulk.label}: ${r.done} done${r.skipped ? `, ${r.skipped} skipped (already in that state)` : ""}.`);
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
  const [pending, start] = React.useTransition();
  React.useEffect(() => setNote(""), [action]);
  return (
    <Dialog open={Boolean(action)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action?.label}: {count} {count === 1 ? "camper" : "campers"}?
          </DialogTitle>
          <DialogDescription>Campers already in that state are skipped. Each change shows your name in their timeline.</DialogDescription>
        </DialogHeader>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. Bus 3" aria-label="Note" dir="auto" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => start(() => onConfirm(note))}>
            {pending ? "Working…" : action?.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
