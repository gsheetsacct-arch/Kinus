"use client";
import * as React from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { STATUS_LABEL, type CamperStatus } from "@/lib/attendance/machine";
import { matchScore, searchEntry } from "@/lib/search";
import type { CamperIndexRow } from "@/lib/data/campers";
import { CAMPER_FLAGS, type CamperFlag } from "@/lib/camper-flags";
import { cn, formatWhen } from "@/lib/utils";

type Division = { id: string; name: string; bunks: { id: string; name: string }[] };
type Filters = { q: string; division: string; bunk: string; status: string; only: string; sort: string };
const PAGE = 100;

/** Updates the address bar without a server round trip, so back/refresh keep the search. */
function writeUrl(f: Filters) {
  const sp = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(f)) {
    if (v && !(k === "sort" && v === "name")) sp.set(k, v);
    else sp.delete(k);
  }
  const qs = sp.toString();
  window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? `?${qs}` : ""));
}

/**
 * The whole camp in the browser: searching and filtering are instant, and only the
 * first rows are drawn until you ask for more.
 */
const has = (r: CamperIndexRow, k: CamperFlag) => (k === "medical" ? Boolean(r.m) : Boolean(r.f?.includes(k)));
// "Medical first", "With notes first"…: these flags can be sorted on
const SORT_FLAGS: { key: CamperFlag; label: string }[] = [
  { key: "medical", label: "Medical first" },
  { key: "notes", label: "With notes first" },
  { key: "later", label: "Coming later first" },
];

export function CampersBrowser({
  rows,
  divisions,
  flags,
  initial,
  archivedHref,
}: {
  rows: CamperIndexRow[];
  divisions: Division[];
  /** The "only campers who…" filters this person can use (lib/camper-flags). */
  flags: CamperFlag[];
  initial: Partial<Filters>;
  archivedHref: string | null;
}) {
  const [f, setF] = React.useState<Filters>({ q: "", division: "", bunk: "", status: "", only: "", sort: "name", ...initial });
  const [shown, setShown] = React.useState(PAGE);
  const q = React.useDeferredValue(f.q);
  const set = (patch: Partial<Filters>) =>
    setF((cur) => {
      const next = { ...cur, ...patch };
      if (patch.division !== undefined && patch.division !== cur.division) next.bunk = "";
      writeUrl(next);
      setShown(PAGE);
      return next;
    });

  const dName = React.useMemo(() => new Map(divisions.map((d) => [d.id, d.name])), [divisions]);
  const bName = React.useMemo(() => new Map(divisions.flatMap((d) => d.bunks.map((b) => [b.id, b.name] as const))), [divisions]);
  const bOrder = React.useMemo(() => new Map(divisions.flatMap((d, di) => d.bunks.map((b, bi) => [b.id, di * 1000 + bi] as const))), [divisions]);
  const index = React.useMemo(() => rows.map((r) => ({ r, e: searchEntry(r.n, r.c, r.p, r.z ?? null) })), [rows]);

  const matched = React.useMemo(() => {
    const out: { r: CamperIndexRow; score: number }[] = [];
    for (const { r, e } of index) {
      if (f.division && r.d !== f.division) continue;
      if (f.bunk && r.b !== f.bunk) continue;
      if (f.only && !has(r, f.only as CamperFlag)) continue;
      const score = matchScore(e, q);
      if (score > 0) out.push({ r, score });
    }
    const byName = (a: CamperIndexRow, b: CamperIndexRow) => a.l.localeCompare(b.l) || a.n.localeCompare(b.n);
    out.sort((a, b) => {
      if (q.trim() && a.score !== b.score) return b.score - a.score;
      const flag = SORT_FLAGS.find((s) => `flag:${s.key}` === f.sort)?.key;
      if (flag) return Number(has(b.r, flag)) - Number(has(a.r, flag)) || byName(a.r, b.r);
      if (f.sort === "bunk") return (bOrder.get(a.r.b ?? "") ?? 1e9) - (bOrder.get(b.r.b ?? "") ?? 1e9) || byName(a.r, b.r);
      if (f.sort === "status") return a.r.s.localeCompare(b.r.s) || byName(a.r, b.r);
      return byName(a.r, b.r);
    });
    return out.map((x) => x.r);
  }, [index, q, f.division, f.bunk, f.only, f.sort, bOrder]);
  // the status chips count what the other filters leave; a chip then narrows to its campers
  const statusCount = React.useMemo(() => {
    const n: Partial<Record<CamperStatus, number>> = {};
    for (const r of matched) n[r.s] = (n[r.s] ?? 0) + 1;
    return n;
  }, [matched]);
  const filtered = React.useMemo(() => (f.status ? matched.filter((r) => r.s === f.status) : matched), [matched, f.status]);

  // only bunks with campers in the list (an emptied bunk isn't offered)
  const hasBunk = React.useMemo(() => new Set(rows.map((r) => r.b)), [rows]);
  const hasDivision = React.useMemo(() => new Set(rows.map((r) => r.d)), [rows]);
  const perDivision = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.d) m.set(r.d, (m.get(r.d) ?? 0) + 1);
    return m;
  }, [rows]);
  const perBunk = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.b) m.set(r.b, (m.get(r.b) ?? 0) + 1);
    return m;
  }, [rows]);
  const bunksHere = (divisions.find((d) => d.id === f.division)?.bunks ?? []).filter((b) => hasBunk.has(b.id) || b.id === f.bunk);
  const filtering = Boolean(f.q || f.division || f.bunk || f.status || f.only);

  return (
    <div className="space-y-3">
      {/* search, then every filter as a row of pills that scrolls sideways (like Who's here) */}
      <div className="no-print relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Name, code or parent phone" dir="auto" className="h-9 pl-9 pr-9" aria-label="Search campers" />
        {f.q && (
          <button type="button" onClick={() => set({ q: "" })} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-muted-foreground hover:bg-muted" aria-label="Clear search">
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* where: a division, then (once one is picked) its bunks */}
      <Pills label="Division">
        <Pill on={!f.division} onClick={() => set({ division: "", bunk: "" })}>
          All divisions
        </Pill>
        {divisions
          .filter((d) => hasDivision.has(d.id) || d.id === f.division)
          .map((d) => (
            <Pill key={d.id} on={f.division === d.id} onClick={() => set({ division: f.division === d.id ? "" : d.id, bunk: "" })} count={perDivision.get(d.id)}>
              {d.name}
            </Pill>
          ))}
      </Pills>
      {f.division && bunksHere.length > 1 && (
        <Pills label="Bunk">
          <Pill on={!f.bunk} onClick={() => set({ bunk: "" })}>
            All bunks
          </Pill>
          {bunksHere.map((b) => (
            <Pill key={b.id} on={f.bunk === b.id} onClick={() => set({ bunk: f.bunk === b.id ? "" : b.id })} count={perBunk.get(b.id)}>
              {b.name}
            </Pill>
          ))}
        </Pills>
      )}

      {/* status, with how many each */}
      <Pills label="Status">
        {(["", ...(Object.keys(STATUS_LABEL) as CamperStatus[])] as const).map((st) => {
          const n = st ? (statusCount[st] ?? 0) : matched.length;
          if (st && !n && f.status !== st) return null;
          return (
            <Pill key={st || "all"} on={f.status === st} onClick={() => set({ status: f.status === st && st ? "" : st })} count={n}>
              {st ? STATUS_LABEL[st] : "Everyone"}
            </Pill>
          );
        })}
      </Pills>

      {/* only campers who…, then the order */}
      <Pills label="Only and sort">
        {flags.map((k) => (
          <Pill key={k} on={f.only === k} onClick={() => set({ only: f.only === k ? "" : k })}>
            {CAMPER_FLAGS[k].label}
          </Pill>
        ))}
        {flags.length > 0 && <span className="mx-1 w-px shrink-0 self-stretch bg-border" aria-hidden />}
        {[
          { v: "name", l: "By last name" },
          { v: "bunk", l: "By bunk" },
          { v: "status", l: "By status" },
          ...SORT_FLAGS.filter((x) => flags.includes(x.key)).map((x) => ({
            v: `flag:${x.key}`,
            l: x.label,
          })),
        ].map((o) => (
          <Pill key={o.v} on={f.sort === o.v} onClick={() => set({ sort: o.v })} quiet>
            {o.l}
          </Pill>
        ))}
      </Pills>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>
          {filtered.length === rows.length ? `${rows.length} campers` : `${filtered.length} of ${rows.length} campers`}
          {filtering && (
            <button type="button" className="ml-2 text-primary hover:underline" onClick={() => set({ q: "", division: "", bunk: "", status: "", only: "" })}>
              Clear filters
            </button>
          )}
        </span>
        {archivedHref && (
          <Link href={archivedHref} className="ml-auto hover:underline">
            {archivedHref.includes("archived=1") ? "Include archived" : "Hide archived"}
          </Link>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
        <div className="hidden grid-cols-[minmax(0,2fr)_80px_minmax(0,1fr)_minmax(0,1fr)_56px_minmax(0,150px)] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
          <span>Name</span>
          <span>Code</span>
          <span>Division</span>
          <span>Bunk</span>
          <span>Grade</span>
          <span>Status</span>
        </div>
        <ul className="divide-y">
          {filtered.slice(0, shown).map((r) => (
            <li key={r.i}>
              <Link
                href={`/campers/${r.i}`}
                prefetch={false}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm hover:bg-muted/50 md:grid-cols-[minmax(0,2fr)_80px_minmax(0,1fr)_minmax(0,1fr)_56px_minmax(0,150px)]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium" dir="auto">
                    {r.n}
                  </span>
                  {r.m && <Badge variant="warning">medical</Badge>}
                  {r.f?.includes("epipen") && <Badge variant="destructive">{CAMPER_FLAGS.epipen.badge}</Badge>}
                  {r.f?.includes("notes") && <Badge variant="outline">{CAMPER_FLAGS.notes.badge}</Badge>}
                  {r.t && <Badge variant="info">coming later · {formatWhen(r.t)}</Badge>}
                  {r.x && <Badge variant="outline">not in export</Badge>}
                  {r.a && <Badge variant="secondary">archived</Badge>}
                </span>
                <span className="row-span-2 md:hidden">
                  <StatusBadge status={r.s} />
                </span>
                <span className="truncate text-xs text-muted-foreground md:hidden" dir="auto">
                  {[r.d ? dName.get(r.d) : null, r.b ? bName.get(r.b) : "no bunk", r.g ? `Grade ${r.g}` : null].filter(Boolean).join(" · ")}
                </span>
                <span className="hidden font-mono text-xs md:block">{r.c}</span>
                <span className="hidden truncate md:block" dir="auto">
                  {r.d ? dName.get(r.d) : "—"}
                </span>
                <span className={cn("hidden truncate md:block", !r.b && "text-muted-foreground")} dir="auto">
                  {r.b ? bName.get(r.b) : "no bunk"}
                </span>
                <span className="hidden md:block">{r.g ?? ""}</span>
                <span className="hidden md:block">
                  <StatusBadge status={r.s} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {!filtered.length && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{rows.length ? "No campers match." : "No campers here yet."}</p>}
      </div>
      {filtered.length > shown && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setShown((n) => n + PAGE * 3)}>
            Show more ({filtered.length - shown} left)
          </Button>
        </div>
      )}
    </div>
  );
}

/** A row of pills that scrolls sideways on a phone (no wrapping onto more lines). */
function Pills({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="no-print -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={label}>
      {children}
    </div>
  );
}

function Pill({ on, onClick, count, quiet, children }: { on: boolean; onClick: () => void; count?: number; quiet?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 text-sm whitespace-nowrap transition-colors hover:border-primary/40",
        quiet && !on && "text-muted-foreground",
        on && (quiet ? "border-foreground/60 bg-muted text-foreground" : "border-primary bg-primary text-primary-foreground hover:border-primary"),
      )}
    >
      <span dir="auto">{children}</span>
      {count !== undefined && <span className={cn("font-semibold tabular-nums", !on && "text-muted-foreground")}>{count}</span>}
    </button>
  );
}
