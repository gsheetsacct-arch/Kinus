"use client";
import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Camp = { id: string; name: string; divisions: { id: string; name: string }[] };
type Row = { id: number; key: string; percent: string; after_date: string; after_time: string };

/**
 * Camps or divisions with a rule of their own (a different share, cut-off date or time): a
 * division's own beats its camp's, which beats the general rule. Sent as JSON in "overrides".
 */
export function MissingOverrides({ camps, initial, defaults }: { camps: Camp[]; initial: { key: string; percent: number; after_date?: string | null; after_time: string | null }[]; defaults: { percent: number } }) {
  const next = React.useRef(initial.length);
  const [rows, setRows] = React.useState<Row[]>(() => initial.map((o, i) => ({ id: i, key: o.key, percent: String(o.percent), after_date: o.after_date ?? "", after_time: o.after_time ?? "" })));
  const update = (id: number, change: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const used = new Set(rows.map((r) => r.key));
  const saved = rows
    .filter((r) => r.key)
    .map((r) => ({ key: r.key, percent: Math.min(100, Math.max(0, Math.round(Number(r.percent) || 0))), after_date: r.after_date || null, after_time: r.after_time || null }));
  return (
    <div className="space-y-2">
      <input type="hidden" name="overrides" value={JSON.stringify(saved)} />
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-2">
          <label className="min-w-0 flex-1 basis-56 space-y-1 text-xs text-muted-foreground">
            For
            <Select value={r.key} onChange={(e) => update(r.id, { key: e.target.value })} aria-label="Camp or division">
              <option value="">Pick a camp or division…</option>
              {camps.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  <option value={`camp:${c.id}`} disabled={used.has(`camp:${c.id}`) && r.key !== `camp:${c.id}`}>
                    All of {c.name}
                  </option>
                  {c.divisions.map((d) => (
                    <option key={d.id} value={`div:${d.id}`} disabled={used.has(`div:${d.id}`) && r.key !== `div:${d.id}`}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Share here
            <span className="flex items-center gap-1">
              <Input type="number" min={0} max={100} value={r.percent} onChange={(e) => update(r.id, { percent: e.target.value })} className="w-20" aria-label="Percent" />
              <span className="text-sm">%</span>
            </span>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Cut-off date
            <Input type="date" value={r.after_date} onChange={(e) => update(r.id, { after_date: e.target.value })} className="w-40" aria-label="Cut-off date" />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Time
            <Input type="time" value={r.after_time} onChange={(e) => update(r.id, { after_time: e.target.value })} className="w-32" aria-label="Cut-off time" />
          </label>
          <Button type="button" size="icon" variant="ghost" aria-label="Remove" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          next.current += 1;
          setRows((rs) => [...rs, { id: next.current, key: "", percent: String(defaults.percent), after_date: "", after_time: "" }]);
        }}
      >
        <Plus /> {rows.length ? "Another camp or division" : "A camp or division with its own rule"}
      </Button>
    </div>
  );
}
