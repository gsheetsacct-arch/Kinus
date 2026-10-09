"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Barcode, QrCode, Square, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Layer, SheetLayout, TemplateSpec } from "@/lib/print/types";
import { previewTemplate, saveTemplate } from "@/app/(app)/print/actions";

export type EditorTemplate = TemplateSpec & { show_on_card: boolean; auto_on_first_checkin: boolean };
type MergeKey = { key: string; label: string };

const ICON = { text: Type, barcode: Barcode, qr: QrCode, box: Square } as const;
const NEW_LAYER: Record<Layer["type"], (t: TemplateSpec) => Layer> = {
  text: (t) => ({ id: "", type: "text", text: "{{FIRST}}", x: 5, y: 5, w: Math.max(10, t.page_width_mm - 10), h: 10, size: 14, weight: 400, align: "center", fit: true }),
  barcode: (t) => ({ id: "", type: "barcode", text: "{{BARCODE}}", x: 5, y: Math.max(0, t.page_height_mm - 17), w: Math.min(60, t.page_width_mm - 10), h: 12, showText: true }),
  qr: (t) => ({ id: "", type: "qr", text: "{{BARCODE}}", x: Math.max(0, t.page_width_mm - 25), y: 5, w: 20, h: 20 }),
  box: () => ({ id: "", type: "box", x: 0, y: 0, w: 4, h: 20, fill: "{{DIVISION_COLOR}}" }),
};
const describe = (l: Layer) => (l.type === "box" ? `Colour block ${l.fill ?? ""}` : l.type === "text" ? l.text || "Text" : `${l.type === "qr" ? "QR code" : "Barcode"} ${l.text}`);
const uid = () => Math.random().toString(36).slice(2, 8);

function Num({ label, value, onChange, step = 0.5 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <label className="space-y-1">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <Input type="number" step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} className="h-9" />
    </label>
  );
}

/** Text with a picker that inserts {{FIELD}} at the cursor. */
function MergeText({ value, onChange, fields, label }: { value: string; onChange: (v: string) => void; fields: MergeKey[]; label: string }) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        <Input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} dir="auto" className="h-9 font-mono text-sm" />
        <Select
          aria-label="Insert a field"
          value=""
          className="h-9 w-36"
          onChange={(e) => {
            const k = e.target.value;
            if (!k) return;
            const el = ref.current;
            const at = el?.selectionStart ?? value.length;
            onChange(`${value.slice(0, at)}{{${k}}}${value.slice(el?.selectionEnd ?? at)}`);
          }}
        >
          <option value="">+ field</option>
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.key} · {f.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

export function TemplateEditor({ initial, fields, background }: { initial: EditorTemplate; fields: MergeKey[]; background: React.ReactNode }) {
  const router = useRouter();
  const [t, setT] = React.useState<EditorTemplate>(() => ({ ...initial, layers: initial.layers.map((l) => ({ ...l, id: l.id || uid() })) }));
  const [open, setOpen] = React.useState<string | null>(t.layers[0]?.id ?? null);
  const [html, setHtml] = React.useState<string>("");
  const [camper, setCamper] = React.useState("");
  const [saving, startSave] = React.useTransition();
  const [dirty, setDirty] = React.useState(false);

  const update = (patch: Partial<EditorTemplate>) => {
    setT((cur) => ({ ...cur, ...patch }));
    setDirty(true);
  };
  const setLayer = (id: string, patch: Partial<Layer>) => update({ layers: t.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) });
  const move = (i: number, d: -1 | 1) => {
    const ls = [...t.layers];
    const j = i + d;
    if (j < 0 || j >= ls.length) return;
    [ls[i], ls[j]] = [ls[j], ls[i]];
    update({ layers: ls });
  };

  // live preview, a moment after typing stops
  React.useEffect(() => {
    const h = setTimeout(() => {
      previewTemplate(t, camper || null)
        .then(setHtml)
        .catch(() => undefined);
    }, 350);
    return () => clearTimeout(h);
  }, [t, camper]);

  // leaving with unsaved changes
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () =>
    startSave(async () => {
      const r = await saveTemplate({ ...t, id: t.id || undefined, kind: t.kind as "name_tag", layers: t.layers, sheet_layout: t.sheet_layout });
      if (!r.ok) return void toast.error(r.error);
      setDirty(false);
      toast.success(r.message);
      if (r.redirect) router.push(r.redirect);
      else router.refresh();
    });

  const sheet = t.sheet_layout;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] sm:grid-cols-2">
          <Field label="Name" htmlFor="tname" className="sm:col-span-2">
            <Input id="tname" value={t.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label="Kind" htmlFor="tkind">
            <Select id="tkind" value={t.kind} onChange={(e) => update({ kind: e.target.value })}>
              <option value="name_tag">Name tag</option>
              <option value="luggage_tag">Luggage tag</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Width (mm)" value={t.page_width_mm} onChange={(n) => update({ page_width_mm: n })} />
            <Num label="Height (mm)" value={t.page_height_mm} onChange={(n) => update({ page_height_mm: n })} />
          </div>
          <Field label="Paper" htmlFor="tsheet" className="sm:col-span-2" hint={sheet ? "Tags are laid out on full sheets, for a regular printer with label paper (e.g. Avery)." : "One tag per page, for a label printer."}>
            <Select
              id="tsheet"
              value={sheet ? "sheet" : "label"}
              onChange={(e) => update({ sheet_layout: e.target.value === "sheet" ? ({ paper: "letter", cols: 2, rows: 5, marginMm: 12, gapMm: 3 } satisfies SheetLayout) : null })}
            >
              <option value="label">Label printer: one tag per page</option>
              <option value="sheet">Sheets of tags (Letter or A4)</option>
            </Select>
          </Field>
          {sheet && (
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-5">
              <label className="space-y-1">
                <span className="block text-xs text-muted-foreground">Sheet</span>
                <Select value={sheet.paper} onChange={(e) => update({ sheet_layout: { ...sheet, paper: e.target.value as SheetLayout["paper"] } })} className="h-9">
                  <option value="letter">Letter</option>
                  <option value="a4">A4</option>
                </Select>
              </label>
              <Num label="Across" step={1} value={sheet.cols} onChange={(n) => update({ sheet_layout: { ...sheet, cols: n } })} />
              <Num label="Down" step={1} value={sheet.rows} onChange={(n) => update({ sheet_layout: { ...sheet, rows: n } })} />
              <Num label="Margin (mm)" value={sheet.marginMm} onChange={(n) => update({ sheet_layout: { ...sheet, marginMm: n } })} />
              <Num label="Gap (mm)" value={sheet.gapMm} onChange={(n) => update({ sheet_layout: { ...sheet, gapMm: n } })} />
            </div>
          )}
          <label className="flex items-center justify-between gap-3 sm:col-span-2">
            <span className="text-sm">
              <span className="font-medium">Button on the camper card</span>
              <span className="block text-xs text-muted-foreground">One tap at check-in sends it to the office.</span>
            </span>
            <Switch checked={t.show_on_card} onCheckedChange={(v) => update({ show_on_card: v })} />
          </label>
          <label className="flex items-center justify-between gap-3 sm:col-span-2">
            <span className="text-sm">
              <span className="font-medium">Print automatically on first check-in</span>
              <span className="block text-xs text-muted-foreground">Requested once per camper, the first time they arrive.</span>
            </span>
            <Switch checked={t.auto_on_first_checkin} onCheckedChange={(v) => update({ auto_on_first_checkin: v })} />
          </label>
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Parts of the tag</h2>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(NEW_LAYER) as Layer["type"][]).map((k) => {
                const Icon = ICON[k];
                return (
                  <Button
                    key={k}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const l = { ...NEW_LAYER[k](t), id: uid() } as Layer;
                      update({ layers: [...t.layers, l] });
                      setOpen(l.id);
                    }}
                  >
                    <Icon /> {k === "qr" ? "QR" : k === "box" ? "Colour" : k[0].toUpperCase() + k.slice(1)}
                  </Button>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Later parts sit on top of earlier ones. Positions are in millimetres from the top-left corner.</p>
          <ul className="space-y-2">
            {t.layers.map((l, i) => {
              const Icon = ICON[l.type];
              const isOpen = open === l.id;
              return (
                <li key={l.id} className={cn("rounded-xl border bg-card shadow-[var(--shadow-card)]", isOpen && "ring-1 ring-primary")}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm" onClick={() => setOpen(isOpen ? null : l.id)} aria-expanded={isOpen}>
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono" dir="auto">
                        {describe(l)}
                      </span>
                    </button>
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move back">
                      <ArrowUp />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8" onClick={() => move(i, 1)} disabled={i === t.layers.length - 1} aria-label="Move forward">
                      <ArrowDown />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => update({ layers: t.layers.filter((x) => x.id !== l.id) })} aria-label="Remove">
                      <Trash2 />
                    </Button>
                  </div>
                  {isOpen && (
                    <div className="space-y-3 border-t px-3 py-3">
                      {l.type !== "box" && <MergeText label={l.type === "text" ? "Text" : "Code"} value={l.text} onChange={(v) => setLayer(l.id, { text: v })} fields={fields} />}
                      {l.type === "box" && (
                        <div className="grid grid-cols-2 gap-2">
                          <MergeText label="Colour (#hex or {{DIVISION_COLOR}})" value={l.fill ?? ""} onChange={(v) => setLayer(l.id, { fill: v })} fields={fields} />
                          <Num label="Rounded corners (mm)" value={l.radius ?? 0} onChange={(n) => setLayer(l.id, { radius: n })} />
                        </div>
                      )}
                      <div className="grid grid-cols-4 gap-2">
                        <Num label="Left" value={l.x} onChange={(n) => setLayer(l.id, { x: n })} />
                        <Num label="Top" value={l.y} onChange={(n) => setLayer(l.id, { y: n })} />
                        <Num label="Width" value={l.w} onChange={(n) => setLayer(l.id, { w: n })} />
                        <Num label="Height" value={l.h} onChange={(n) => setLayer(l.id, { h: n })} />
                      </div>
                      {l.type === "text" && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Num label="Size (pt)" step={1} value={l.size} onChange={(n) => setLayer(l.id, { size: n })} />
                          <label className="space-y-1">
                            <span className="block text-xs text-muted-foreground">Align</span>
                            <Select value={l.align ?? "left"} onChange={(e) => setLayer(l.id, { align: e.target.value as "left" })} className="h-9">
                              <option value="left">Left</option>
                              <option value="center">Centre</option>
                              <option value="right">Right</option>
                            </Select>
                          </label>
                          <label className="space-y-1">
                            <span className="block text-xs text-muted-foreground">Colour</span>
                            <Input value={l.color ?? "#111111"} onChange={(e) => setLayer(l.id, { color: e.target.value })} className="h-9 font-mono" />
                          </label>
                          <div className="flex flex-col justify-end gap-1.5 text-sm">
                            <label className="flex items-center gap-2">
                              <input type="checkbox" className="size-4" checked={l.weight === 700} onChange={(e) => setLayer(l.id, { weight: e.target.checked ? 700 : 400 })} /> Bold
                            </label>
                            <label className="flex items-center gap-2" title="Long names get smaller instead of being cut off">
                              <input type="checkbox" className="size-4" checked={l.fit !== false} onChange={(e) => setLayer(l.id, { fit: e.target.checked })} /> Shrink to fit
                            </label>
                            <label className="flex items-center gap-2">
                              <input type="checkbox" className="size-4" checked={Boolean(l.wrap)} onChange={(e) => setLayer(l.id, { wrap: e.target.checked })} /> Wrap lines
                            </label>
                          </div>
                        </div>
                      )}
                      {l.type === "barcode" && (
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="size-4" checked={l.showText !== false} onChange={(e) => setLayer(l.id, { showText: e.target.checked })} /> Show the code under the bars
                        </label>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        {background}
      </div>

      <div className="space-y-3 xl:sticky xl:top-6 xl:self-start">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1">
            <span className="block text-xs text-muted-foreground">Preview with a real camper (empty: a sample with Hebrew and French)</span>
            <Input value={camper} onChange={(e) => setCamper(e.target.value.trim())} placeholder="Camper code, e.g. 100016" inputMode="numeric" className="h-9" />
          </label>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : dirty || !t.id ? "Save template" : "Saved"}
          </Button>
        </div>
        <iframe title="Preview" srcDoc={html} className="h-[420px] w-full rounded-xl border bg-muted" />
      </div>
    </div>
  );
}
