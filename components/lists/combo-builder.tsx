"use client";
import * as React from "react";
import { Combine, Plus, Split, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Sep = "dot" | "comma" | "slash" | "line";
type Combo = { key: string; id: string; label: string; parts: string[]; sep: Sep; labels: boolean; show: boolean };
const SEPS: Record<Sep, string> = { dot: "·  (dot)", comma: ",  (comma)", slash: "/  (slash)", line: "One per line" };

const ticked = () => [...document.querySelectorAll<HTMLInputElement>('input[name="columns"]:checked')];

/**
 * Combined columns on the list layout page: tick fields in Columns, then "Combine into one
 * column" (as many groups as wanted); each group is a card with its name, what goes between,
 * its fields (remove one, add the ticked ones), split back or remove. Saved with the layout
 * through hidden fields (combo_*), as savePreset reads them.
 */
export function ComboBuilder({ initial, options }: { initial: { id: string; label: string; parts: string[]; sep: Sep; labels: boolean; show: boolean }[]; options: { key: string; label: string }[] }) {
  const [combos, setCombos] = React.useState<Combo[]>(() => initial.map((c) => ({ ...c, key: c.id })));
  const [count, setCount] = React.useState(0);
  const labelOf = (k: string) => options.find((o) => o.key === k)?.label ?? k;

  // how many fields are ticked in Columns (the buttons say so)
  React.useEffect(() => {
    const read = () => setCount(ticked().length);
    read();
    const onChange = (e: Event) => (e.target as HTMLInputElement | null)?.name === "columns" && read();
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);
  // the ticked fields, taken out of Columns (they show inside the combined column instead)
  const takeTicked = () => {
    const boxes = ticked();
    const keys = boxes.map((b) => b.value).filter((k) => !k.startsWith("combo:"));
    for (const b of boxes) b.checked = false;
    setCount(0);
    return keys;
  };
  const tick = (keys: string[]) => {
    for (const b of document.querySelectorAll<HTMLInputElement>('input[name="columns"]')) if (keys.includes(b.value)) b.checked = true;
    setCount(ticked().length);
  };
  const update = (key: string, patch: Partial<Combo>) => setCombos((cur) => cur.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const combine = () => {
    const parts = takeTicked();
    if (parts.length < 2) return;
    setCombos((cur) => [...cur, { key: `new-${Date.now()}`, id: "", label: parts.slice(0, 3).map(labelOf).join(" / ").slice(0, 60), parts, sep: "dot", labels: false, show: true }]);
  };

  return (
    <div className="space-y-3">
      <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-primary-soft/60 p-2.5 text-sm backdrop-blur md:top-2">
        <span className="min-w-0 flex-1">{count ? `${count} ticked in Columns` : "Tick fields in Columns, then combine them into one column."}</span>
        <Button type="button" size="sm" disabled={count < 2} onClick={combine}>
          <Combine /> Combine into one column
        </Button>
      </div>

      {combos.map((c, i) => (
        <div key={c.key} className="space-y-2 rounded-lg border bg-background p-3">
          {/* what savePreset reads */}
          <input type="hidden" name={`combo_id_${i}`} value={c.id} />
          <input type="hidden" name={`combo_label_${i}`} value={c.label} />
          <input type="hidden" name={`combo_sep_${i}`} value={c.sep} />
          {c.labels && <input type="hidden" name={`combo_labels_${i}`} value="on" />}
          {c.show && <input type="hidden" name={`combo_show_${i}`} value="on" />}
          {c.parts.map((p) => (
            <input key={p} type="hidden" name={`combo_part_${i}`} value={p} />
          ))}

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input value={c.label} onChange={(e) => update(c.key, { label: e.target.value.slice(0, 60) })} placeholder="Column name" aria-label="Column name" dir="auto" />
            <select value={c.sep} onChange={(e) => update(c.key, { sep: e.target.value as Sep })} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Between them">
              {Object.entries(SEPS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {c.parts.map((p) => (
              <span key={p} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pl-2.5 pr-1 text-sm" dir="auto">
                {labelOf(p)}
                <button type="button" className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => update(c.key, { parts: c.parts.filter((x) => x !== p) })} aria-label={`Take ${labelOf(p)} out`}>
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            {!c.parts.length && <span className="text-sm text-destructive">Nothing in it: add fields, or remove it.</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={c.labels} onChange={(e) => update(c.key, { labels: e.target.checked })} className="size-4 accent-[var(--primary)]" /> Name each (“Shirt: M”)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={c.show} onChange={(e) => update(c.key, { show: e.target.checked })} className="size-4 accent-[var(--primary)]" /> Show this column
            </label>
            <span className="ml-auto flex flex-wrap gap-1">
              <Button type="button" size="sm" variant="outline" disabled={!count} onClick={() => update(c.key, { parts: [...new Set([...c.parts, ...takeTicked()])] })}>
                <Plus /> Add ticked fields
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Its fields go back to being columns of their own"
                onClick={() => {
                  tick(c.parts);
                  setCombos((cur) => cur.filter((x) => x.key !== c.key));
                }}
              >
                <Split /> Split
              </Button>
              <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setCombos((cur) => cur.filter((x) => x.key !== c.key))}>
                <Trash2 /> Remove
              </Button>
            </span>
          </div>
        </div>
      ))}
      {!combos.length && <p className="text-sm text-muted-foreground">No combined columns yet.</p>}
    </div>
  );
}
