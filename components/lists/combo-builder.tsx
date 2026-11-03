"use client";
import * as React from "react";
import { Combine, Plus, Split, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Sep = "dot" | "comma" | "slash" | "line";
type Combo = { key: string; id: string; label: string; parts: string[]; sep: Sep; labels: boolean; show: boolean };
const SEPS: Record<Sep, string> = { dot: "·  (dot)", comma: ",  (comma)", slash: "/  (slash)", line: "One per line" };


/**
 * Combined columns on the list layout page: Ctrl/⌘-click (or long-press) fields in Columns
 * and a question pops up at the top: group them into a new column, or add them to one there
 * is (as many groups as wanted). Each group is a card with its name, what goes between, its
 * fields (take one out), split back or remove. Saved with the layout
 * through hidden fields (combo_*), as savePreset reads them.
 */
export function ComboBuilder({ initial, options }: { initial: { id: string; label: string; parts: string[]; sep: Sep; labels: boolean; show: boolean }[]; options: { key: string; label: string }[] }) {
  const [combos, setCombos] = React.useState<Combo[]>(() => initial.map((c) => ({ ...c, key: c.id })));
  const labelOf = (k: string) => options.find((o) => o.key === k)?.label ?? k;
  // fields picked for grouping: Ctrl/⌘-click (or a long press) on a field in Columns; a plain
  // click still just ticks it
  const [picked, setPicked] = React.useState<string[]>([]);
  React.useEffect(() => {
    for (const el of document.querySelectorAll<HTMLElement>("label[data-field]")) el.dataset.grouping = picked.includes(el.dataset.field!) ? "on" : "";
  }, [picked]);
  React.useEffect(() => {
    const toggle = (key: string) => setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
    const fieldOf = (e: Event) => (e.target as HTMLElement | null)?.closest<HTMLElement>("label[data-field]");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pressed: string | null = null;
    const onClick = (e: MouseEvent) => {
      const el = fieldOf(e);
      if (!el) return;
      if (pressed === el.dataset.field) {
        // the click that ends a long press: it picked the field, it doesn't tick it
        e.preventDefault();
        pressed = null;
        return;
      }
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      toggle(el.dataset.field!);
    };
    const onDown = (e: PointerEvent) => {
      const el = fieldOf(e);
      if (!el || e.pointerType === "mouse") return;
      timer = setTimeout(() => {
        pressed = el.dataset.field!;
        toggle(pressed);
        if ("vibrate" in navigator) navigator.vibrate(30);
      }, 450);
    };
    const cancel = () => clearTimeout(timer);
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointerup", cancel);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("pointermove", cancel);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", cancel);
      document.removeEventListener("pointercancel", cancel);
      document.removeEventListener("pointermove", cancel);
    };
  }, []);
  // a grouped field isn't also a column of its own
  const untick = (keys: string[]) => {
    for (const b of document.querySelectorAll<HTMLInputElement>('input[name="columns"]')) if (keys.includes(b.value)) b.checked = false;
  };
  const tick = (keys: string[]) => {
    for (const b of document.querySelectorAll<HTMLInputElement>('input[name="columns"]')) if (keys.includes(b.value)) b.checked = true;
  };
  const update = (key: string, patch: Partial<Combo>) => setCombos((cur) => cur.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const group = () => {
    if (!picked.length) return;
    untick(picked);
    setCombos((cur) => [...cur, { key: `new-${Date.now()}`, id: "", label: picked.slice(0, 3).map(labelOf).join(" / ").slice(0, 60), parts: picked, sep: "dot", labels: false, show: true }]);
    setPicked([]);
  };
  const addTo = (key: string) => {
    untick(picked);
    setCombos((cur) => cur.map((c) => (c.key === key ? { ...c, parts: [...new Set([...c.parts, ...picked])] } : c)));
    setPicked([]);
  };

  return (
    <div className="space-y-3">
      {/* fields picked for grouping: the question, at the top of the screen */}
      {picked.length > 0 && (
        <div className="fixed inset-x-3 top-3 z-50 mx-auto max-w-xl space-y-2 rounded-xl border-2 border-amber-400 bg-card p-3 shadow-2xl" role="dialog" aria-label="Group these fields">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">Group {picked.length === 1 ? "this field" : `these ${picked.length} fields`} into one column?</span>
              <span className="block truncate text-muted-foreground" dir="auto">
                {picked.map(labelOf).join(" · ")}
              </span>
            </p>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPicked([])} aria-label="Cancel">
              <X />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" disabled={picked.length < 2} onClick={group} title={picked.length < 2 ? "Pick at least two (Ctrl-click another)" : undefined}>
              <Combine /> Group into a new column
            </Button>
            {combos.map((c) => (
              <Button key={c.key} type="button" size="sm" variant="outline" onClick={() => addTo(c.key)}>
                <Plus /> Add to “{c.label || "Combined"}”
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Ctrl-click (⌘ on a Mac, long-press on a phone) more fields to add them; a plain click ticks as usual.</p>
        </div>
      )}

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
      {!combos.length && <p className="text-sm text-muted-foreground">None yet. In Columns, hold Ctrl (⌘ on a Mac) and click the fields to put together, or long-press them on a phone.</p>}
    </div>
  );
}
