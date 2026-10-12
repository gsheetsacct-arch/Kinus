"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Barcode, Bold, Check, Eye, Plus, Printer, QrCode, Square, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DEFAULT_MIN_PT } from "@/lib/print/render-constants";
import { fitPreview } from "@/lib/print/fit-preview";
import { sheetPlacement, type Layer, type SheetLayout, type TemplateSpec } from "@/lib/print/types";
import { presetSummary, type LabelPreset } from "@/lib/print/presets";
import { currentPreset, LabelPicker, SheetDiagram, sizeText } from "./label-picker";
import { previewTemplate, previewValues, saveTemplate } from "@/app/(app)/print/actions";
import { TagCanvas, type FitInfo } from "./tag-canvas";
import { useCode } from "./code-image";
import { fill } from "@/lib/print/merge";
import { LeaveGuard } from "@/components/leave-guard";

export type EditorTemplate = TemplateSpec & { show_on_card: boolean; auto_on_first_checkin: boolean };
export type MergeKey = { key: string; label: string; enabled: boolean };

const ICON = { text: Type, barcode: Barcode, qr: QrCode, box: Square } as const;
const uid = () => Math.random().toString(36).slice(2, 8);
/** "{{LAST}}, {{FIRST}}" → "Last name, First name" for the parts list. */
const describe = (l: Layer, labels: Map<string, string>) => {
  const words = (t: string) => t.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, k: string) => k.split("|").map((x) => labels.get(x.trim()) ?? x.trim()).join(" or "));
  return l.type === "box" ? "Colour block" : l.type === "text" ? words(l.text) || "Text" : `${l.type === "qr" ? "QR code" : "Barcode"}: ${words(l.text)}`;
};
const usedKeys = (layers: Layer[]) => new Set(layers.flatMap((l) => [...("text" in l ? l.text : (l.fill ?? "")).matchAll(/\{\{\s*([^{}|]+)/g)].map((m) => m[1].trim())));

const tidy = (n: number) => Math.round(n * 100) / 100;

/** Scales every part of the design by sx × sy (text by the smaller of the two). */
function scaleLayers(layers: Layer[], sx: number, sy: number): Layer[] {
  const k = Math.min(sx, sy);
  return layers.map((l) => {
    const box = { x: tidy(l.x * sx), y: tidy(l.y * sy), w: tidy(l.w * sx), h: tidy(l.h * sy) };
    if (l.type === "text") return { ...l, ...box, size: Math.max(4, Math.round(l.size * k * 2) / 2), ...(l.minSize ? { minSize: Math.max(4, Math.round(l.minSize * k)) } : {}) };
    if (l.type === "qr") {
      const side = Math.min(box.w, box.h);
      return { ...l, ...box, w: side, h: side };
    }
    return { ...l, ...box };
  });
}

/** Says what's wrong when the labels don't fit on the paper. */
function sheetFit(s: SheetLayout, w: number, h: number): string | null {
  const [pw, ph] = s.paper === "a4" ? [210, 297] : [215.9, 279.4];
  const at = sheetPlacement(s, w, h, pw);
  const dx = s.shiftXMm ?? 0;
  const dy = s.shiftYMm ?? 0;
  if (at.left + dx < -0.05 || at.left + dx + at.pitchX * (s.cols - 1) + w > pw + 0.05) return `${s.cols} labels across don't fit on the paper.`;
  if (at.top + dy < -0.05 || at.top + dy + at.pitchY * (s.rows - 1) + h > ph + 0.05) return `${s.rows} labels down don't fit on the paper.`;
  if (s.cols > 1 && at.pitchX < w - 0.05) return "The labels overlap side by side.";
  if (s.rows > 1 && at.pitchY < h - 0.05) return "The labels overlap top to bottom.";
  return null;
}

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

/** Thinnest bar most scanners and phone cameras read reliably off a printed label. */
const MIN_BAR_MM = 0.25;

/** Says whether the barcode, at this size, will scan. */
function BarcodeCheck({ l, values }: { l: Extract<Layer, { type: "barcode" }>; values: Record<string, string> }) {
  const text = fill(l.text, (k) => values[k] ?? "") || l.text;
  const code = useCode("barcode", text);
  if (!code?.modules) return null;
  const length = l.rotate ? l.h : l.w;
  const tall = (l.rotate ? l.w : l.h) - (l.showText !== false ? 3 : 0);
  const bar = length / code.modules;
  const need = Math.ceil(code.modules * MIN_BAR_MM);
  const problem = bar < MIN_BAR_MM ? `The bars are too thin to scan reliably (${bar.toFixed(2)} mm). Make the barcode at least ${need} mm long.` : tall < 6 ? "The bars are very short. Make the barcode at least 6 mm tall so it scans easily." : null;
  return (
    <p className={cn("rounded-md px-2 py-1.5 text-xs", problem ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" : "bg-muted text-muted-foreground")}>
      {problem ?? `Scans well: bars are ${bar.toFixed(2)} mm, with blank space built in on each side.`}
    </p>
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
  const [picking, setPicking] = React.useState(false);

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

  const persist = async (leaving = false) => {
    const r = await saveTemplate({ ...t, id: t.id || undefined, kind: t.kind as "name_tag", layers: t.layers, sheet_layout: t.sheet_layout });
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    setDirty(false);
    toast.success(r.message);
    if (leaving) return true;
    if (r.redirect) router.push(r.redirect);
    else router.refresh();
    return true;
  };
  const save = () => startSave(async () => void (await persist()));

  const W = t.page_width_mm;
  const H = t.page_height_mm;
  const center = (w: number, h: number) => ({ x: Math.max(0, Math.round((W - w) / 2)), y: Math.max(0, Math.round((H - h) / 2)), w: Math.min(w, W), h: Math.min(h, H) });
  const sel = t.layers.find((l) => l.id === selected) ?? null;
  const labels = new Map(fields.map((f) => [f.key, f.label]));
  const fit = sel ? fits[sel.id] : undefined;
  const hidden = [...usedKeys(t.layers)].filter((k) => fields.some((f) => f.key === k && !f.enabled));
  const sheet = t.sheet_layout;
  const preset = currentPreset(W, H, sheet);
  const placed = sheet ? sheetPlacement(sheet, W, H, sheet.paper === "a4" ? 210 : 215.9) : null;
  const sheetProblem = sheet && placed ? sheetFit(sheet, W, H) : null;
  /** Older layouts (margin + gap) become exact positions the first time they're edited. */
  const exact = (s: SheetLayout): SheetLayout => {
    const at = sheetPlacement(s, W, H, s.paper === "a4" ? 210 : 215.9);
    return { paper: s.paper, cols: s.cols, rows: s.rows, leftMm: tidy(at.left), topMm: tidy(at.top), pitchXMm: tidy(at.pitchX), pitchYMm: tidy(at.pitchY), shiftXMm: s.shiftXMm, shiftYMm: s.shiftYMm };
  };
  const setSheet = (patch: Partial<SheetLayout>) => sheet && update({ sheet_layout: { ...exact(sheet), preset: patch.shiftXMm !== undefined || patch.shiftYMm !== undefined ? sheet.preset : undefined, ...patch } });
  /** A new label size: the design is scaled to fill it, so nothing ends up off the label. */
  const resize = (w: number, h: number, sheetLayout: SheetLayout | null) => {
    const sx = w / W;
    const sy = h / H;
    const scaled = Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01;
    update({ page_width_mm: w, page_height_mm: h, sheet_layout: sheetLayout, layers: scaled ? scaleLayers(t.layers, sx, sy) : t.layers });
    if (scaled && t.layers.length) toast.message("The design was resized to fit the new labels. Check the text sizes.");
  };
  const pick = (p: LabelPreset | null) => {
    setPicking(false);
    if (!p) {
      if (preset) update({ sheet_layout: sheet ? { ...exact(sheet), preset: undefined } : null });
      return;
    }
    resize(p.widthMm, p.heightMm, p.sheet ? { ...p.sheet, preset: p.id, shiftXMm: sheet?.shiftXMm, shiftYMm: sheet?.shiftYMm } : null);
  };
  const testSheet = async () => {
    const html = await previewTemplate(t, who === "code" ? { kind: "code", code } : { kind: who }, { fullSheet: true });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const w = window.open(url, "_blank");
    if (!w) toast.error("Allow pop-ups for Kinus to print the test sheet.");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  return (
    <div className="space-y-4">
      <LeaveGuard dirty={dirty} onSave={() => persist(true)} />
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
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Unsaved changes</span>}
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
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="size-4" checked={sel.showText !== false} onChange={(e) => setLayer(sel.id, { showText: e.target.checked })} /> Show the code under the bars
                    </label>
                    <BarcodeCheck l={sel} values={sample.values} />
                  </>
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
                        {describe(l, labels)}
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
              <div className="space-y-2">
                <span className="block text-sm font-medium">Labels</span>
                <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
                  {sheet && <SheetDiagram sheet={sheet} w={W} h={H} className="w-14" />}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{preset ? `${preset.brand} ${preset.product}` : sheet ? "Custom sheet" : "Custom size, one per page"}</p>
                    <p className="text-xs text-muted-foreground">{preset ? preset.name : sizeText(W, H)}</p>
                    <p className="text-xs text-muted-foreground">{preset ? presetSummary(preset) : sheet ? `${sheet.cols * sheet.rows} per ${sheet.paper === "a4" ? "A4" : "Letter"} sheet` : "For a label printer"}</p>
                    {sheetProblem && <p className="mt-1 text-xs font-medium text-destructive">{sheetProblem}</p>}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setPicking(true)}>
                  Choose labels (Avery, Dymo, Brother…)
                </Button>
              </div>
              <details className="text-sm" open={!preset}>
                <summary className="cursor-pointer text-xs text-muted-foreground">Size and layout by hand</summary>
                <div className="mt-2 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Num label="Label width (mm)" value={W} onChange={(n) => update({ page_width_mm: n, sheet_layout: sheet ? { ...sheet, preset: undefined } : null })} />
                    <Num label="Label height (mm)" value={H} onChange={(n) => update({ page_height_mm: n, sheet_layout: sheet ? { ...sheet, preset: undefined } : null })} />
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => resize(H, W, sheet)}>
                    Turn the label sideways ({+H.toFixed(1)} × {+W.toFixed(1)} mm)
                  </Button>
                  <Select
                    aria-label="Paper"
                    value={sheet ? "sheet" : "label"}
                    onChange={(e) => update({ sheet_layout: e.target.value === "sheet" ? exact({ paper: "letter", cols: 2, rows: 5, marginMm: 12, gapMm: 3 }) : null })}
                    className="h-9"
                  >
                    <option value="label">Label printer: one label per page</option>
                    <option value="sheet">Sheets of labels (Letter or A4)</option>
                  </Select>
                  {sheet && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span className="block text-xs text-muted-foreground">Sheet</span>
                        <Select value={sheet.paper} onChange={(e) => setSheet({ paper: e.target.value as SheetLayout["paper"] })} className="h-9">
                          <option value="letter">Letter</option>
                          <option value="a4">A4</option>
                        </Select>
                      </label>
                      <span />
                      <Num label="Across" step={1} min={1} value={sheet.cols} onChange={(n) => setSheet({ cols: n })} />
                      <Num label="Down" step={1} min={1} value={sheet.rows} onChange={(n) => setSheet({ rows: n })} />
                      <Num label="First label from left (mm)" step={0.1} value={placed!.left} onChange={(n) => setSheet({ leftMm: n })} />
                      <Num label="First label from top (mm)" step={0.1} value={placed!.top} onChange={(n) => setSheet({ topMm: n })} />
                      <Num label="Left of one to left of next (mm)" step={0.1} value={placed!.pitchX} onChange={(n) => setSheet({ pitchXMm: n })} />
                      <Num label="Top of one to top of next (mm)" step={0.1} value={placed!.pitchY} onChange={(n) => setSheet({ pitchYMm: n })} />
                    </div>
                  )}
                </div>
              </details>
              {sheet && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Printing a little off the labels?</summary>
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Print a test sheet on plain paper (at <strong>Actual size / 100%</strong>, not “Fit to page”), hold it over a sheet of labels against the light, and move everything until the outlines line up. Each printer is a little different.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Num label="Move right (mm)" step={0.5} value={sheet.shiftXMm ?? 0} onChange={(n) => setSheet({ shiftXMm: n })} />
                      <Num label="Move down (mm)" step={0.5} value={sheet.shiftYMm ?? 0} onChange={(n) => setSheet({ shiftYMm: n })} />
                    </div>
                    <Button size="sm" variant="outline" onClick={testSheet}>
                      <Printer /> Print a test sheet
                    </Button>
                  </div>
                </details>
              )}
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  <span className="font-medium">Print button at check-in</span>
                  <span className="block text-xs text-muted-foreground">
                    Adds a “{t.name || "this tag"}” button to every camper&apos;s card, on Check in and on the camper&apos;s page. Staff tap it when a tag is lost or wrong, and it goes to the office to print. Leave it off for labels only the office prints.
                  </span>
                </span>
                <Switch checked={t.show_on_card} onCheckedChange={(v) => update({ show_on_card: v })} />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  <span className="font-medium">Print by itself at first check-in</span>
                  <span className="block text-xs text-muted-foreground">The first time each camper is checked in, this tag goes to the office print queue on its own, without anyone tapping. Only once per camper.</span>
                </span>
                <Switch checked={t.auto_on_first_checkin} onCheckedChange={(v) => update({ auto_on_first_checkin: v })} />
              </label>
              {background}
            </div>
          </details>
        </div>
      </div>

      <LabelPicker open={picking} onOpenChange={setPicking} current={preset} onPick={pick} />
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
