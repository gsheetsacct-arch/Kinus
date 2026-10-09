"use client";
import * as React from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { STATUS_LABEL, type CamperStatus } from "@/lib/attendance/machine";
import { matchScore, searchEntry } from "@/lib/search";
import type { CamperIndexRow } from "@/lib/data/campers";
import { cn } from "@/lib/utils";

type Division = { id: string; name: string; bunks: { id: string; name: string }[] };
type Filters = { q: string; division: string; bunk: string; status: string; sort: string };
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
export function CampersBrowser({ rows, divisions, initial, archivedHref }: { rows: CamperIndexRow[]; divisions: Division[]; initial: Partial<Filters>; archivedHref: string | null }) {
  const [f, setF] = React.useState<Filters>({ q: "", division: "", bunk: "", status: "", sort: "name", ...initial });
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
  const index = React.useMemo(() => rows.map((r) => ({ r, e: searchEntry(r.n, r.c, r.p) })), [rows]);

  const filtered = React.useMemo(() => {
    const out: { r: CamperIndexRow; score: number }[] = [];
    for (const { r, e } of index) {
      if (f.division && r.d !== f.division) continue;
      if (f.bunk && r.b !== f.bunk) continue;
      if (f.status && r.s !== f.status) continue;
      const score = matchScore(e, q);
      if (score > 0) out.push({ r, score });
    }
    const byName = (a: CamperIndexRow, b: CamperIndexRow) => a.l.localeCompare(b.l) || a.n.localeCompare(b.n);
    out.sort((a, b) => {
      if (q.trim() && a.score !== b.score) return b.score - a.score;
      if (f.sort === "bunk") return (bOrder.get(a.r.b ?? "") ?? 1e9) - (bOrder.get(b.r.b ?? "") ?? 1e9) || byName(a.r, b.r);
      if (f.sort === "status") return a.r.s.localeCompare(b.r.s) || byName(a.r, b.r);
      return byName(a.r, b.r);
    });
    return out.map((x) => x.r);
  }, [index, q, f.division, f.bunk, f.status, f.sort, bOrder]);

  const bunks = f.division ? (divisions.find((d) => d.id === f.division)?.bunks ?? []) : divisions.flatMap((d) => d.bunks);
  const filtering = Boolean(f.q || f.division || f.bunk || f.status);

  return (
    <div className="space-y-4">
      <div className="no-print grid gap-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] md:grid-cols-[1fr_180px_160px_140px_140px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={f.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Name in any language, camper code, or parent phone"
            dir="auto"
            className="pl-9 pr-9"
            aria-label="Search campers"
            autoFocus={!initial.q}
          />
          {f.q && (
            <button type="button" onClick={() => set({ q: "" })} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
        <Select value={f.division} onChange={(e) => set({ division: e.target.value })} aria-label="Division">
          <option value="">All divisions</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select value={f.bunk} onChange={(e) => set({ bunk: e.target.value })} aria-label="Bunk">
          <option value="">All bunks</option>
          {bunks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select value={f.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
          <option value="">Any status</option>
          {(Object.keys(STATUS_LABEL) as CamperStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={f.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort by">
          <option value="name">Sort: last name</option>
          <option value="bunk">Sort: bunk</option>
          <option value="status">Sort: status</option>
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {filtered.length === rows.length ? `${rows.length} campers` : `${filtered.length} of ${rows.length} campers`}
          {filtering && (
            <button type="button" className="ml-2 text-primary hover:underline" onClick={() => set({ q: "", division: "", bunk: "", status: "" })}>
              Clear filters
            </button>
          )}
        </span>
        {archivedHref && (
          <Link href={archivedHref} className="hover:underline">
            {archivedHref.includes("archived=1") ? "Include archived campers" : "Hide archived campers"}
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
