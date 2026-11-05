"use client";
import * as React from "react";

export type ResetCamp = { id: string; name: string; divisions: { id: string; name: string; campers: number }[] };

/**
 * Which divisions' check-ins to reset: each camp with its divisions, ticked one by one or a whole
 * camp at once. Nothing is ticked to start with. Sent as "division" (one per division).
 */
export function ResetPicker({ camps }: { camps: ResetCamp[] }) {
  const [on, setOn] = React.useState<Set<string>>(new Set());
  const all = camps.flatMap((c) => c.divisions.map((d) => d.id));
  const set = (ids: string[], value: boolean) =>
    setOn((cur) => {
      const n = new Set(cur);
      for (const id of ids) if (value) n.add(id);
      else n.delete(id);
      return n;
    });
  const campers = camps.flatMap((c) => c.divisions).filter((d) => on.has(d.id)).reduce((n, d) => n + d.campers, 0);
  return (
    <div className="space-y-3">
      {[...on].map((id) => (
        <input key={id} type="hidden" name="division" value={id} />
      ))}
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4 accent-[var(--destructive)]" checked={on.size === all.length && all.length > 0} onChange={(e) => set(all, e.target.checked)} />
        Everything (all camps)
      </label>
      <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border p-3">
        {camps.map((c) => {
          const ids = c.divisions.map((d) => d.id);
          const every = ids.length > 0 && ids.every((id) => on.has(id));
          const some = ids.some((id) => on.has(id));
          return (
            <div key={c.id} className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--destructive)]"
                  checked={every}
                  ref={(el) => {
                    if (el) el.indeterminate = some && !every;
                  }}
                  onChange={(e) => set(ids, e.target.checked)}
                />
                {c.name}
              </label>
              <div className="grid gap-1 pl-6 sm:grid-cols-2">
                {c.divisions.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm" dir="auto">
                    <input type="checkbox" className="size-4 accent-[var(--destructive)]" checked={on.has(d.id)} onChange={(e) => set([d.id], e.target.checked)} />
                    {d.name}
                    <span className="text-xs text-muted-foreground">{d.campers}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-sm">{on.size ? <>Resets <strong>{campers.toLocaleString("en-US")}</strong> campers in {on.size} {on.size === 1 ? "division" : "divisions"}. Everyone else stays as they are.</> : <span className="text-muted-foreground">Tick the camps or divisions to reset.</span>}</p>
    </div>
  );
}
