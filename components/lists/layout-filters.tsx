"use client";
import * as React from "react";
import { Filter, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { layoutFilterValues } from "@/app/(app)/admin/presets/actions";

import { WHERE_ANY as ANY, WHERE_EMPTY as EMPTY } from "@/lib/list-where";

type Kind = { title: string; options: { key: string; label: string }[] };
type Row = { id: number; key: string; values: string[] };
type Answers = { values: { value: string; count: number }[]; empty: number } | "loading" | { error: string };

/**
 * The layout's filters: "only campers whose <field> is <these answers>". Any field a list can
 * show (Kinus' own, Sleeping, every export column, by kind); its real answers this session, with
 * how many campers have each, are tapped to pick, plus "Has anything" and "Empty". Several
 * answers: any of them. Several filters: every one. Sent as JSON in "where".
 */
export function LayoutFilters({ kinds, initial }: { kinds: Kind[]; initial: { key: string; values: string[] }[] }) {
  const next = React.useRef(initial.length);
  const [rows, setRows] = React.useState<Row[]>(() => initial.map((w, i) => ({ id: i, ...w })));
  const [answers, setAnswers] = React.useState<Record<string, Answers>>({});
  const labelOf = React.useMemo(() => new Map(kinds.flatMap((k) => k.options.map((o) => [o.key, o.label] as const))), [kinds]);

  const asked = React.useRef(new Set<string>());
  const load = React.useCallback((key: string) => {
    if (!key || asked.current.has(key)) return;
    asked.current.add(key);
    setAnswers((a) => ({ ...a, [key]: "loading" }));
    layoutFilterValues(key)
      .then((r) => setAnswers((b) => ({ ...b, [key]: r.ok ? { values: r.values, empty: r.empty } : { error: r.error } })))
      .catch(() => setAnswers((b) => ({ ...b, [key]: { error: "Couldn't load its answers." } })));
  }, []);
  React.useEffect(() => {
    for (const r of rows) load(r.key);
  }, [rows, load]);

  const update = (id: number, change: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const toggle = (r: Row, v: string) => {
    // "Has anything" and "Empty" stand alone; picking an answer clears them
    const special = v === ANY || v === EMPTY;
    const on = r.values.includes(v);
    const values = on ? r.values.filter((x) => x !== v) : special ? [v] : [...r.values.filter((x) => x !== ANY && x !== EMPTY), v];
    update(r.id, { values });
  };
  const saved = rows.filter((r) => r.key && r.values.length).map(({ key, values }) => ({ key, values }));

  return (
    <div className="space-y-3">
      <input type="hidden" name="where" value={JSON.stringify(saved)} />
      {rows.map((r) => {
        const a = r.key ? answers[r.key] : undefined;
        const missing = r.values.filter((v) => v !== ANY && v !== EMPTY && a && typeof a === "object" && "values" in a && !a.values.some((x) => x.value === v));
        return (
          <div key={r.id} className="space-y-2.5 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Filter className="size-4 shrink-0 text-primary" />
              <Select value={r.key} onChange={(e) => update(r.id, { key: e.target.value, values: [] })} aria-label="Field" className="min-w-0 flex-1">
                <option value="">Pick a field…</option>
                {kinds.map((k) => (
                  <optgroup key={k.title} label={k.title}>
                    {k.options.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
              <Button type="button" size="icon" variant="ghost" aria-label="Remove this filter" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                <X />
              </Button>
            </div>
            {r.key && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Only campers whose <strong className="text-foreground">{labelOf.get(r.key) ?? r.key}</strong> {r.values.length > 1 ? "is any of these" : "is"}:
                </p>
                <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
                  <Chip on={r.values.includes(ANY)} onClick={() => toggle(r, ANY)}>
                    Has anything
                  </Chip>
                  <Chip on={r.values.includes(EMPTY)} onClick={() => toggle(r, EMPTY)} count={a && typeof a === "object" && "empty" in a ? a.empty : undefined}>
                    Empty
                  </Chip>
                  {a === "loading" && (
                    <span className="inline-flex items-center gap-1 px-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" /> its answers…
                    </span>
                  )}
                  {a && typeof a === "object" && "error" in a && <span className="px-2 text-xs text-destructive">{a.error}</span>}
                  {a && typeof a === "object" && "values" in a &&
                    a.values.map((v) => (
                      <Chip key={v.value} on={r.values.includes(v.value)} onClick={() => toggle(r, v.value)} count={v.count}>
                        {v.value.length > 50 ? `${v.value.slice(0, 50)}…` : v.value}
                      </Chip>
                    ))}
                  {/* answers saved before that nobody has this session (still kept) */}
                  {missing.map((v) => (
                    <Chip key={v} on onClick={() => toggle(r, v)} count={0}>
                      {v}
                    </Chip>
                  ))}
                </div>
                {!r.values.length && <p className="text-xs text-amber-700 dark:text-amber-400">Pick at least one answer, or this filter isn&apos;t saved.</p>}
              </div>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={rows.length >= 10}
        onClick={() => {
          next.current += 1;
          setRows((rs) => [...rs, { id: next.current, key: "", values: [] }]);
        }}
      >
        <Plus /> {rows.length ? "Add another filter" : "Add a filter"}
      </Button>
      <p className="text-xs text-muted-foreground">
        {rows.length > 1 ? "Campers must match every filter; within one, any answer ticked. " : "No filter: every camper. "}
        Answers and counts are this session&apos;s.
      </p>
    </div>
  );
}

function Chip({ on, onClick, count, children }: { on: boolean; onClick: () => void; count?: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      dir="auto"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50 hover:bg-primary-soft/50",
      )}
    >
      {children}
      {count !== undefined && <span className={cn("tabular-nums", on ? "text-primary-foreground/80" : "text-muted-foreground")}>{count}</span>}
    </button>
  );
}
