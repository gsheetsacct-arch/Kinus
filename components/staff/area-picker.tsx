"use client";
import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AreaTree } from "@/lib/data/areas";

/**
 * "All of camp" or a choice of groups, divisions and bunks. Picking a group covers
 * all its divisions (also ones added to it later); picking a division covers all its
 * bunks. Submits `all_areas` and `areas` ("g:…", "d:…", "b:…:…").
 */
export function AreaPicker({ tree, defaultAll, defaultAreas, lockAll }: { tree: AreaTree; defaultAll: boolean; defaultAreas: string[]; lockAll?: boolean }) {
  const [all, setAll] = React.useState(defaultAll && !lockAll);
  const [sel, setSel] = React.useState<Set<string>>(new Set(defaultAreas));
  const [open, setOpen] = React.useState<Set<string>>(new Set(defaultAreas.filter((a) => a.startsWith("b:")).map((a) => a.split(":")[1])));
  const toggle = (v: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });
  const groupOf = (divisionId: string) => tree.divisions.find((d) => d.id === divisionId)?.group_id ?? null;
  const coveredByGroup = (divisionId: string) => {
    const g = groupOf(divisionId);
    return g !== null && sel.has(`g:${g}`);
  };
  const ungrouped = tree.divisions.filter((d) => !d.group_id || !tree.groups.some((g) => g.id === d.group_id));
  const count = sel.size;

  const Division = ({ d, indent }: { d: AreaTree["divisions"][number]; indent?: boolean }) => {
    const inGroup = coveredByGroup(d.id);
    const whole = inGroup || sel.has(`d:${d.id}`);
    const bunksPicked = d.bunks.filter((b) => sel.has(`b:${d.id}:${b.id}`)).length;
    const expanded = open.has(d.id);
    return (
      <div className={cn(indent && "ml-6")}>
        <div className="flex items-center gap-2 py-1.5">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={whole} disabled={inGroup} onChange={() => toggle(`d:${d.id}`)} aria-label={d.name} />
          <span className="h-4 w-1 rounded-full" style={{ background: d.color ?? "var(--muted-foreground)" }} />
          <span className="flex-1 text-sm" dir="auto">
            {d.name}
            {!whole && bunksPicked > 0 && <span className="ml-2 text-xs text-primary">{bunksPicked} {bunksPicked === 1 ? "bunk" : "bunks"}</span>}
          </span>
          {d.bunks.length > 0 && !whole && (
            <button
              type="button"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              onClick={() => setOpen((o) => (o.has(d.id) ? new Set([...o].filter((x) => x !== d.id)) : new Set([...o, d.id])))}
            >
              Bunks <ChevronRight className={cn("size-3 transition-transform", expanded && "rotate-90")} />
            </button>
          )}
        </div>
        {expanded && !whole && (
          <div className="mb-1 ml-6 grid gap-x-4 sm:grid-cols-2">
            {d.bunks.map((b) => (
              <label key={b.id} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={sel.has(`b:${d.id}:${b.id}`)} onChange={() => toggle(`b:${d.id}:${b.id}`)} />
                <span dir="auto">{b.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name="all_areas" value={all ? "on" : ""} />
      {!all && [...sel].map((v) => <input key={v} type="hidden" name="areas" value={v} />)}
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { v: true, label: "All of camp", desc: "Every division, including ones added later." },
          { v: false, label: "Only some of camp", desc: "Pick groups, divisions or bunks." },
        ].map((o) => (
          <label
            key={String(o.v)}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-sm",
              all === o.v && "border-primary bg-primary-soft/50 ring-1 ring-primary",
              o.v && lockAll && "pointer-events-none opacity-50",
            )}
          >
            <input type="radio" checked={all === o.v} onChange={() => setAll(o.v)} className="mt-0.5 size-4 accent-[var(--primary)]" disabled={o.v && lockAll} />
            <span>
              <span className="block font-medium">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.desc}</span>
            </span>
          </label>
        ))}
      </div>
      {!all && (
        <div className="rounded-lg border bg-background p-3">
          {tree.divisions.length === 0 && <p className="text-sm text-muted-foreground">No divisions yet. Import the roster first.</p>}
          {tree.groups.map((g) => {
            const divs = tree.divisions.filter((d) => d.group_id === g.id);
            return (
              <div key={g.id} className="border-b pb-2 last:border-0 last:pb-0 [&:not(:first-child)]:pt-2">
                <label className="flex items-center gap-2 py-1.5">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={sel.has(`g:${g.id}`)} onChange={() => toggle(`g:${g.id}`)} />
                  <span className="text-sm font-semibold" dir="auto">
                    {g.name}
                  </span>
                  <span className="text-xs text-muted-foreground">group · {divs.length} divisions</span>
                </label>
                {divs.map((d) => (
                  <Division key={d.id} d={d} indent />
                ))}
              </div>
            );
          })}
          {ungrouped.map((d) => (
            <Division key={d.id} d={d} />
          ))}
          <p className="mt-2 text-xs text-muted-foreground">{count === 0 ? "Nothing picked yet." : `${count} picked.`}</p>
        </div>
      )}
    </div>
  );
}
