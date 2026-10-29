"use client";
import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@/lib/auth/permissions";
import type { AreaTree } from "@/lib/data/areas";
import { AreaPicker } from "./area-picker";

/**
 * "Where" asked the way the role needs it: a counselor picks their bunk, head staff their
 * division, directors and the office a camp (or all of camp). Anything else (a mix of
 * camps, divisions and bunks) goes through "Pick exactly", the full tree.
 * Submits `all_areas` and `areas` ("g:…", "d:…", "b:…:…") like AreaPicker.
 */
type Kind = "bunk" | "division" | "camp";
const KIND: Partial<Record<StaffRole, Kind>> = {
  counselor: "bunk",
  kloli: "division",
  head_counselor: "division",
  division_head: "division",
  scanner: "division",
  director: "camp",
  office: "camp",
  logistics: "camp",
};
const QUESTION: Record<Kind, string> = {
  bunk: "Which bunk?",
  division: "Which division?",
  camp: "Which camp?",
};

export const whereKind = (role: StaffRole): Kind | null => KIND[role] ?? null;

function fits(kind: Kind, all: boolean, sel: Set<string>, tree: AreaTree): boolean {
  const v = [...sel];
  if (kind === "bunk") return !all && v.every((a) => a.startsWith("b:") || a.startsWith("d:"));
  if (all) return true;
  if (kind === "division") return v.every((a) => a.startsWith("g:") || a.startsWith("d:"));
  return tree.groups.length ? v.every((a) => a.startsWith("g:")) : v.every((a) => a.startsWith("d:"));
}

/** The same choices, reshaped for another role (a counselor's bunk → its division for a head counselor…). */
function reshape(kind: Kind, all: boolean, sel: Set<string>, tree: AreaTree, lockAll?: boolean): { all: boolean; sel: Set<string> } {
  // directors and the office usually cover all of camp
  if (kind === "camp" && !all && sel.size === 0) return { all: !lockAll, sel };
  if (fits(kind, all, sel, tree)) return { all, sel };
  const divisionOf = (a: string) => (a.startsWith("d:") || a.startsWith("b:") ? a.split(":")[1] : null);
  const groupOf = (a: string) => (a.startsWith("g:") ? a.slice(2) : (tree.divisions.find((d) => d.id === divisionOf(a))?.group_id ?? null));
  if (kind === "bunk") return { all: false, sel: new Set([...sel].filter((a) => a.startsWith("b:") || a.startsWith("d:"))) };
  if (kind === "division") return { all: false, sel: new Set([...sel].map((a) => (a.startsWith("b:") ? `d:${divisionOf(a)}` : a))) };
  const groups = new Set([...sel].map(groupOf).filter((g): g is string => !!g).map((g) => `g:${g}`));
  return groups.size ? { all: false, sel: groups } : { all: !lockAll, sel: new Set() };
}

function Chip({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
        on ? "border-primary/50 bg-primary-soft font-medium text-primary" : "bg-card text-foreground/80 hover:bg-muted",
        className,
      )}
    >
      {on && <Check className="size-3.5" />}
      {children}
    </button>
  );
}

export function WherePicker({
  tree,
  role,
  defaultAll,
  defaultAreas,
  lockAll,
  readOnly,
}: {
  tree: AreaTree;
  role: StaffRole;
  defaultAll: boolean;
  defaultAreas: string[];
  lockAll?: boolean;
  readOnly?: boolean;
}) {
  const kind = whereKind(role);
  const [all, setAll] = React.useState(defaultAll && !lockAll);
  const [sel, setSel] = React.useState<Set<string>>(new Set(defaultAreas));
  const [exact, setExact] = React.useState(() => !kind || !fits(kind, defaultAll && !lockAll, new Set(defaultAreas), tree));
  // the division whose bunks are showing (counselors)
  const [open, setOpen] = React.useState<string | null>(() => {
    const first = defaultAreas.find((a) => a.startsWith("b:") || a.startsWith("d:"));
    return first ? first.split(":")[1] : tree.divisions.length === 1 ? tree.divisions[0].id : null;
  });

  // a new role asks the question its own way; keep what was picked where it still makes sense
  const lastRole = React.useRef(role);
  React.useEffect(() => {
    if (lastRole.current === role) return;
    lastRole.current = role;
    if (!kind || exact) return;
    const next = reshape(kind, all, sel, tree, lockAll);
    setAll(next.all);
    setSel(next.sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const toggle = (v: string, only?: (a: string) => boolean) =>
    setSel((s) => {
      const n = new Set(only ? [...s].filter(only) : s);
      if (s.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });
  const pickAll = () => {
    setAll((a) => !a);
    setSel(new Set());
  };
  const pick = (v: string) => {
    setAll(false);
    toggle(v);
  };

  if (exact || !kind)
    return (
      <div className={cn("space-y-2", readOnly && "pointer-events-none opacity-70")}>
        <AreaPicker
          tree={tree}
          defaultAll={all}
          defaultAreas={[...sel]}
          lockAll={lockAll}
          onChange={(a, s) => {
            setAll(a);
            setSel(new Set(s));
          }}
        />
        {kind && fits(kind, all, sel, tree) && !readOnly && (
          <button type="button" onClick={() => setExact(false)} className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline">
            Back to the simple choice
          </button>
        )}
      </div>
    );

  const grouped = tree.groups.map((g) => ({ group: g, divisions: tree.divisions.filter((d) => d.group_id === g.id) })).filter((x) => x.divisions.length);
  const loose = tree.divisions.filter((d) => !d.group_id || !tree.groups.some((g) => g.id === d.group_id));
  const rows = [...grouped, ...(loose.length ? [{ group: null, divisions: loose }] : [])];
  const labelled = rows.length > 1;
  const dot = (color: string | null) => <span className="size-2 rounded-full" style={{ background: color ?? "var(--muted-foreground)" }} />;
  const bunksPicked = (divisionId: string) => [...sel].filter((a) => a.startsWith(`b:${divisionId}:`)).length;
  const picked = [...sel];
  const nameOf = (a: string) => {
    const [k, x, y] = a.split(":");
    const d = tree.divisions.find((v) => v.id === x);
    if (k === "g") return `all of ${tree.groups.find((g) => g.id === x)?.name ?? "a camp"}`;
    if (k === "d") return d?.name ?? "a division";
    return `${d?.bunks.find((v) => v.id === y)?.name ?? "a bunk"}${tree.divisions.length > 1 ? ` (${d?.name})` : ""}`;
  };

  return (
    <div className={cn("space-y-3", readOnly && "pointer-events-none opacity-70")}>
      <input type="hidden" name="all_areas" value={all ? "on" : ""} />
      {!all && picked.map((v) => <input key={v} type="hidden" name="areas" value={v} />)}
      <p className="text-sm font-medium">
        {QUESTION[kind]}
        {kind === "bunk" && !open && <span className="font-normal text-muted-foreground"> Pick their division first.</span>}
      </p>

      {tree.divisions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No divisions yet. Import the roster first, or choose all of camp.</p>
      ) : kind === "camp" ? (
        <div className="flex flex-wrap gap-2">
          {!lockAll && (
            <Chip on={all} onClick={pickAll}>
              All of camp
            </Chip>
          )}
          {grouped.length
            ? grouped.map(({ group }) => (
                <Chip key={group.id} on={!all && sel.has(`g:${group.id}`)} onClick={() => pick(`g:${group.id}`)}>
                  <span dir="auto">{group.name}</span>
                </Chip>
              ))
            : tree.divisions.map((d) => (
                <Chip key={d.id} on={!all && sel.has(`d:${d.id}`)} onClick={() => pick(`d:${d.id}`)}>
                  {dot(d.color)}
                  <span dir="auto">{d.name}</span>
                </Chip>
              ))}
        </div>
      ) : kind === "division" ? (
        <div className="space-y-2">
          {!lockAll && (
            <Chip on={all} onClick={pickAll}>
              All of camp
            </Chip>
          )}
          {rows.map(({ group, divisions }) => {
            const whole = !!group && sel.has(`g:${group.id}`);
            return (
              <div key={group?.id ?? "-"} className={cn(labelled && "grid gap-1.5 sm:grid-cols-[7rem_1fr] sm:items-center")}>
                {labelled && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" dir="auto">
                    {group?.name ?? "Other"}
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  {divisions.map((d) => (
                    <Chip key={d.id} on={!all && (whole || sel.has(`d:${d.id}`))} onClick={() => (whole ? undefined : pick(`d:${d.id}`))} className={cn(whole && "cursor-default")}>
                      {dot(d.color)}
                      <span dir="auto">{d.name}</span>
                    </Chip>
                  ))}
                  {group && divisions.length > 1 && (
                    <Chip on={!all && whole} onClick={() => pick(`g:${group.id}`)} className="border-dashed">
                      All of <span dir="auto">{group.name}</span>
                    </Chip>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            {rows.map(({ group, divisions }) => (
              <div key={group?.id ?? "-"} className={cn(labelled && "grid gap-1.5 sm:grid-cols-[7rem_1fr] sm:items-center")}>
                {labelled && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" dir="auto">
                    {group?.name ?? "Other"}
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  {divisions.map((d) => {
                    const n = bunksPicked(d.id) + (sel.has(`d:${d.id}`) ? 1 : 0);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setOpen(d.id)}
                        aria-pressed={open === d.id}
                        className={cn(
                          "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                          open === d.id ? "border-foreground/40 bg-foreground text-background" : "bg-card text-foreground/80 hover:bg-muted",
                        )}
                      >
                        {dot(d.color)}
                        <span dir="auto">{d.name}</span>
                        {n > 0 && <span className={cn("rounded-full px-1.5 text-xs", open === d.id ? "bg-background/20" : "bg-primary-soft text-primary")}>{n}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {open &&
            (() => {
              const d = tree.divisions.find((x) => x.id === open);
              if (!d) return null;
              const whole = sel.has(`d:${d.id}`);
              return (
                <div className="rounded-lg border bg-background p-3">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Bunks in <span dir="auto">{d.name}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {d.bunks.map((b) => (
                      <Chip key={b.id} on={whole || sel.has(`b:${d.id}:${b.id}`)} onClick={() => (whole ? undefined : pick(`b:${d.id}:${b.id}`))}>
                        <span dir="auto">{b.name}</span>
                      </Chip>
                    ))}
                    <Chip on={whole} onClick={() => toggle(`d:${d.id}`, (a) => !a.startsWith(`b:${d.id}:`))} className="border-dashed">
                      Whole division
                    </Chip>
                  </div>
                  {d.bunks.length === 0 && <p className="text-sm text-muted-foreground">No bunks in this division yet.</p>}
                </div>
              );
            })()}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{all ? "All of camp, including divisions added later." : picked.length ? `Picked: ${picked.map(nameOf).join(", ")}` : "Nothing picked yet."}</span>
        {!readOnly && (
          <button type="button" onClick={() => setExact(true)} className="text-left underline decoration-dotted underline-offset-2 hover:text-primary">
            Pick exactly (a mix of camps, divisions and bunks)
          </button>
        )}
      </div>
    </div>
  );
}
