"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Barcode, Bold, Check, Eye, Plus, QrCode, Square, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DEFAULT_MIN_PT } from "@/lib/print/render-constants";
import { fitPreview } from "@/lib/print/fit-preview";
import type { Layer, SheetLayout, TemplateSpec } from "@/lib/print/types";
import { previewTemplate, previewValues, saveTemplate } from "@/app/(app)/print/actions";
import { TagCanvas, type FitInfo } from "./tag-canvas";

export type EditorTemplate = TemplateSpec & { show_on_card: boolean; auto_on_first_checkin: boolean };
export type MergeKey = { key: string; label: string; enabled: boolean };

const ICON = { text: Type, barcode: Barcode, qr: QrCode, box: Square } as const;
const uid = () => Math.random().toString(36).slice(2, 8);
const describe = (l: Layer) => (l.type === "box" ? "Colour block" : l.type === "text" ? l.text || "Text" : `${l.type === "qr" ? "QR code" : "Barcode"} ${l.text}`);
const usedKeys = (layers: Layer[]) => new Set(layers.flatMap((l) => [...("text" in l ? l.text : (l.fill ?? "")).matchAll(/\{\{\s*([^{}|]+)/g)].map((m) => m[1].trim())));

function Num({ label, value, onChange, step = 0.5, min }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number }) {
  return (
    <label className="min-w-0 space-y-1">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <Input type="number" step={step} min={min} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} className="h-9" />
    </label>
  );
}

/** Text with a picker that inserts {{FIELD}} at the cursor. */
function MergeText({ value, onChange, fields, label }: { value: string; onChange: (v: string) => void; fields: MergeKey[]; label: string }) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <Input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} dir="auto" className="h-9 font-mono text-sm" />
      <Select
        aria-label="Insert a field"
        value=""
        className="h-8 text-xs"
        onChange={(e) => {
          const k = e.target.value;
          if (!k) return;
          const el = ref.current;
          const at = el?.selectionStart ?? value.length;
          onChange(`${value.slice(0, at)}{{${k}}}${value.slice(el?.selectionEnd ?? at)}`);
        }}
      >
        <option value="">+ Insert a field…</option>
        {fields
          .filter((f) => f.enabled)
          .map((f) => (
            <option key={f.key} value={f.key}>
              {f.label} ({f.key})
            </option>
          ))}
      </Select>
    </div>
  );
}

export function TemplateEditor({ initial, fields, background, backgroundUrl }: { initial: EditorTemplate; fields: MergeKey[]; background: React.ReactNode; backgroundUrl: string | null }) {
  const router = useRouter();
  const [t, setT] = React.useState<EditorTemplate>(() => ({ ...initial, layers: initial.layers.map((l) => ({ ...l, id: l.id || uid() })) }));
  const [selected, setSelected] = React.useState<string | null>(null);
  const [fits, setFits] = React.useState<Record<string, FitInfo>>({});
  const [sample, setSample] = React.useState<{ values: Record<string, string>; label: string }>({ values: {}, label: "" });
  const [who, setWho] = React.useState<"sample" | "longest" | "code">("sample");
  const [code, setCode] = React.useState("");
  const [saving, startSave] = React.useTransition();
  const [dirty, setDirty] = React.useState(false);
  const [preview, setPreview] = React.useState<string | null>(null);
  const frame = React.useRef<HTMLIFrameElement>(null);

  const update = (patch: Partial<EditorTemplate>) => {
    setT((cur) => ({ ...cur, ...patch }));
    setDirty(true);
  };
  const setLayer = React.useCallback((id: string, patch: Partial<Layer>) => {
    setT((cur) => ({ ...cur, layers: cur.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) }));
    setDirty(true);
  }, []);
  const remove = React.useCallback((id: string) => {
    setT((cur) => ({ ...cur, layers: cur.layers.filter((l) => l.id !== id) }));
    setSelected(null);
    setDirty(true);
  }, []);
  const add = (l: Omit<Layer, "id">) => {
    const id = uid();
    setT((cur) => ({ ...cur, layers: [...cur.layers, { ...l, id } as Layer] }));
    setSelected(id);
    setDirty(true);
    (document.activeElement as HTMLElement | null)?.blur();
  };
  const move = (i: number, d: -1 | 1) => {
    const ls = [...t.layers];
    const j = i + d;
    if (j < 0 || j >= ls.length) return;
    [ls[i], ls[j]] = [ls[j], ls[i]];
    update({ layers: ls });
  };
  const onFit = React.useCallback((id: string, info: FitInfo) => setFits((cur) => (cur[id]?.pt === info.pt && cur[id]?.overflow === info.overflow ? cur : { ...cur, [id]: info })), []);

  // whose details fill the canvas
  React.useEffect(() => {
    if (who === "code" && !/^\D*\d{6}\D*$/.test(code)) return;
    let live = true;
    previewValues(who === "code" ? { kind: "code", code } : { kind: who }).then((r) => {
      if (!live) return;
      if ("error" in r) toast.error(r.error);
      else setSample(r);
    });
    return () => {
      live = false;
    };
  }, [who, code]);

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

  const W = t.page_width_mm;
  const H = t.page_height_mm;
  const center = (w: number, h: number) => ({ x: Math.max(0, Math.round((W - w) / 2)), y: Math.max(0, Math.round((H - h) / 2)), w: Math.min(w, W), h: Math.min(h, H) });
  const sel = t.layers.find((l) => l.id === selected) ?? null;
  const fit = sel ? fits[sel.id] : undefined;
  const hidden = [...usedKeys(t.layers)].filter((k) => fields.some((f) => f.key === k && !f.enabled));
  const sheet = t.sheet_layout;

  return (
    <div className="space-y-4">
      {/* top bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-[var(--shadow-card)]">
        <label className="min-w-48 flex-1 space-y-1">
          <span className="block text-xs text-muted-foreground">Template name</span>
          <Input value={t.name} onChange={(e) => update({ name: e.target.value })} className="h-9" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">Show it with</span>
          <Select value={who} onChange={(e) => setWho(e.target.value as typeof who)} className="h-9 w-48">
            <option value="sample">A sample camper</option>
            <option value="longest">The longest name</option>
            <option value="code">A camper by code…</option>
          </Select>
        </label>
        {who === "code" && (
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Camper code</span>
            <Input value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="100016" inputMode="numeric" className="h-9 w-28" />
          </label>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={async () => setPreview(await previewTemplate(t, who === "code" ? { kind: "code", code } : { kind: who }))}>
            <Eye /> Print preview
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? (
              "Saving…"
            ) : dirty || !t.id ? (
              "Save"
            ) : (
              <>
                <Check /> Saved
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* canvas */}
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Add a field"
              value=""
              className="h-9 w-56"
              onChange={(e) => {
                const k = e.target.value;
                if (!k) return;
                add({ type: "text", text: `{{${k}}}`, ...center(Math.min(70, W - 10), 10), size: 14, weight: 400, align: "center", fit: true } as Omit<Layer, "id">);
              }}
            >
              <option value="">+ Add a field…</option>
              {fields
                .filter((f) => f.enabled)
                .map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
            </Select>
            <Button size="sm" variant="outline" onClick={() => add({ type: "text", text: "Text", ...center(40, 8), size: 12, align: "center", fit: true } as Omit<Layer, "id">)}>
              <Type /> Text
            </Button>
            <Button size="sm" variant="outline" onClick={() => add({ type: "barcode", text: "{{BARCODE}}", ...center(50, 12), showText: true } as Omit<Layer, "id">)}>
              <Barcode /> Barcode
            </Button>
            <Button size="sm" variant="outline" onClick={() => add({ type: "qr", text: "{{BARCODE}}", ...center(18, 18) } as Omit<Layer, "id">)}>
              <QrCode /> QR
            </Button>
            <Button size="sm" variant="outline" onClick={() => add({ type: "box", x: 0, y: 0, w: 4, h: H, fill: "{{DIVISION_COLOR}}" } as Omit<Layer, "id">)}>
              <Square /> Colour
            </Button>
          </div>
          <div className="rounded-xl border bg-muted/60 p-4 sm:p-6">
            <TagCanvas
              width={W}
              height={H}
              layers={t.layers}
              values={sample.values}
              background={backgroundUrl}
              selected={selected}
              onSelect={setSelected}
              onChange={setLayer}
              onDelete={remove}
              onFit={onFit}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {sample.label && <>Showing {sample.label}. </>}
            Drag a part to move it, pull its handles to resize. Arrow keys nudge (Shift: 5 mm), Delete removes. Text stays inside its box.
          </p>
          {hidden.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5" /> Uses fields that are off the merge list: {hidden.join(", ")}. They still print here.
            </p>
          )}
        </div>

        {/* side panel */}
        <div className="space-y-4">
          <section className="space-y-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
            {!sel ? (
              <p className="text-sm text-muted-foreground">Click a part of the tag to change it, or add one above.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">{sel.type === "text" ? "Text" : sel.type === "box" ? "Colour block" : sel.type === "qr" ? "QR code" : "Barcode"}</h2>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(sel.id)}>
                    <Trash2 /> Remove
                  </Button>
                </div>
                {sel.type !== "box" && <MergeText key={sel.id} label={sel.type === "text" ? "Says" : "Code"} value={sel.text} onChange={(v) => setLayer(sel.id, { text: v })} fields={fields} />}
                {sel.type === "text" && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Num label="Text size (pt)" step={1} min={4} value={sel.size} onChange={(n) => setLayer(sel.id, { size: n })} />
                      <Num label="Never smaller than (pt)" step={1} min={3} value={sel.minSize ?? DEFAULT_MIN_PT} onChange={(n) => setLayer(sel.id, { minSize: n })} />
                    </div>
                    <p className={cn("rounded-md px-2 py-1.5 text-xs", fit?.overflow ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" : "bg-muted text-muted-foreground")}>
                      {!fit
                        ? "Short text prints at this size; longer text shrinks to stay in the box."
                        : fit.overflow
                          ? `Too long for this box even at ${sel.minSize ?? DEFAULT_MIN_PT} pt: make the box bigger, allow more than one line, or lower the minimum.`
                          : fit.pt < sel.size
                            ? `Shrinks to ${fit.pt} pt for this camper (shorter text prints at ${sel.size} pt). Make the box wider to keep it bigger.`
                            : `Fits at ${sel.size} pt.`}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button size="icon" variant={sel.weight === 700 ? "default" : "outline"} className="size-9" onClick={() => setLayer(sel.id, { weight: sel.weight === 700 ? 400 : 700 })} aria-label="Bold" aria-pressed={sel.weight === 700}>
                        <Bold />
                      </Button>
                      {(
                        [
                          ["left", AlignLeft],
                          ["center", AlignCenter],
                          ["right", AlignRight],
                        ] as const
                      ).map(([a, Icon]) => (
                        <Button key={a} size="icon" variant={(sel.align ?? "left") === a ? "default" : "outline"} className="size-9" onClick={() => setLayer(sel.id, { align: a })} aria-label={`Align ${a}`}>
                          <Icon />
                        </Button>
                      ))}
                      <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                        Colour
                        <input type="color" value={/^#[0-9a-f]{6}$/i.test(sel.color ?? "") ? sel.color : "#111111"} onChange={(e) => setLayer(sel.id, { color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border bg-transparent" />
                      </label>
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="size-4" checked={sel.fit !== false} onChange={(e) => setLayer(sel.id, { fit: e.target.checked })} /> Shrink long text to fit the box
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="size-4" checked={Boolean(sel.wrap)} onChange={(e) => setLayer(sel.id, { wrap: e.target.checked })} /> Allow more than one line
                      </label>
                    </div>
                  </>
                )}
                {sel.type === "barcode" && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={sel.showText !== false} onChange={(e) => setLayer(sel.id, { showText: e.target.checked })} /> Show the code under the bars
                  </label>
                )}
                {sel.type === "box" && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant={sel.fill === "{{DIVISION_COLOR}}" ? "default" : "outline"} onClick={() => setLayer(sel.id, { fill: "{{DIVISION_COLOR}}" })}>
                        Division colour
                      </Button>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        or
                        <input type="color" value={/^#[0-9a-f]{6}$/i.test(sel.fill ?? "") ? sel.fill : "#2563eb"} onChange={(e) => setLayer(sel.id, { fill: e.target.value })} className="h-8 w-10 cursor-pointer rounded border bg-transparent" />
                      </label>
                    </div>
                    <Num label="Rounded corners (mm)" value={sel.radius ?? 0} onChange={(n) => setLayer(sel.id, { radius: n })} />
                  </div>
                )}
                {(sel.type === "text" || sel.type === "barcode") && (
                  <label className="block space-y-1">
                    <span className="block text-xs text-muted-foreground">Direction</span>
                    <Select value={String(sel.rotate ?? 0)} onChange={(e) => setLayer(sel.id, { rotate: Number(e.target.value) as 0 | 90 | -90 })} className="h-9">
                      <option value="0">Across</option>
                      <option value="-90">Up the side (bottom to top)</option>
                      <option value="90">Down the side (top to bottom)</option>
                    </Select>
                  </label>
                )}
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Exact position (mm)</summary>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    <Num label="Left" value={sel.x} onChange={(n) => setLayer(sel.id, { x: n })} />
                    <Num label="Top" value={sel.y} onChange={(n) => setLayer(sel.id, { y: n })} />
                    <Num label="Width" value={sel.w} onChange={(n) => setLayer(sel.id, { w: n })} />
                    <Num label="Height" value={sel.h} onChange={(n) => setLayer(sel.id, { h: n })} />
                  </div>
                </details>
              </>
            )}
          </section>

          <section className="rounded-xl border bg-card shadow-[var(--shadow-card)]">
            <h2 className="border-b px-4 py-2.5 text-sm font-semibold">Parts ({t.layers.length})</h2>
            <ul className="max-h-72 divide-y overflow-y-auto">
              {[...t.layers].reverse().map((l) => {
                const i = t.layers.indexOf(l);
                const Icon = ICON[l.type];
                return (
                  <li key={l.id} className={cn("flex items-center gap-1 px-2 py-1", l.id === selected && "bg-primary-soft/60")}>
                    <button type="button" onClick={() => setSelected(l.id)} className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono text-xs" dir="auto">
                        {describe(l)}
                      </span>
                      {fits[l.id]?.overflow && <AlertTriangle className="size-3.5 shrink-0 text-amber-500" aria-label="Doesn't fit" />}
                    </button>
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => move(i, 1)} disabled={i === t.layers.length - 1} aria-label="Bring forward">
                      <ArrowUp />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Send back">
                      <ArrowDown />
                    </Button>
                  </li>
                );
              })}
              {!t.layers.length && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  <Plus className="mx-auto mb-1 size-4" />
                  Add a field to start.
                </li>
              )}
            </ul>
          </section>

          <details className="rounded-xl border bg-card shadow-[var(--shadow-card)]" open={!t.id}>
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">Template settings</summary>
            <div className="grid gap-4 border-t p-4">
              <Field label="Kind" htmlFor="tkind">
                <Select id="tkind" value={t.kind} onChange={(e) => update({ kind: e.target.value })}>
                  <option value="name_tag">Name tag</option>
                  <option value="luggage_tag">Luggage tag</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Num label="Width (mm)" value={W} onChange={(n) => update({ page_width_mm: n })} />
                <Num label="Height (mm)" value={H} onChange={(n) => update({ page_height_mm: n })} />
              </div>
              <Field label="Paper" htmlFor="tsheet" hint={sheet ? "Tags laid out on full sheets for a regular printer (e.g. Avery)." : "One tag per page, for a label printer."}>
                <Select
                  id="tsheet"
                  value={sheet ? "sheet" : "label"}
                  onChange={(e) => update({ sheet_layout: e.target.value === "sheet" ? ({ paper: "letter", cols: 2, rows: 5, marginMm: 12, gapMm: 3 } satisfies SheetLayout) : null })}
                >
                  <option value="label">Label printer: one per page</option>
                  <option value="sheet">Sheets of tags (Letter or A4)</option>
                </Select>
              </Field>
              {sheet && (
                <div className="grid grid-cols-2 gap-2">
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
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  <span className="font-medium">Button on the camper card</span>
                  <span className="block text-xs text-muted-foreground">One tap at check-in sends it to the office.</span>
                </span>
                <Switch checked={t.show_on_card} onCheckedChange={(v) => update({ show_on_card: v })} />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  <span className="font-medium">Print on first check-in</span>
                  <span className="block text-xs text-muted-foreground">Requested once per camper, the first time they arrive.</span>
                </span>
                <Switch checked={t.auto_on_first_checkin} onCheckedChange={(v) => update({ auto_on_first_checkin: v })} />
              </label>
              {background}
            </div>
          </details>
        </div>
      </div>

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Print preview</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">Exactly as it prints{who === "code" && code ? ` for camper ${code}` : ""}.</p>
          <iframe ref={frame} title="Print preview" srcDoc={preview ?? ""} onLoad={() => fitPreview(frame.current)} className="h-[60vh] w-full rounded-lg border bg-muted" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
