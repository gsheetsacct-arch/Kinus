"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  ArrowDown,
  ArrowUp,
  Barcode,
  Bold,
  Check,
  Copy,
  Eye,
  Image as ImageIcon,
  Italic,
  Plus,
  Printer,
  QrCode,
  Redo2,
  Square,
  Trash2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
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
import { fitCheckPeople, previewTemplate, previewValues, saveTemplate, uploadTemplateImage } from "@/app/(app)/print/actions";
import { TagCanvas, type FitInfo } from "./tag-canvas";
import { boxCapPt, checkFit, type FitPerson, type FitResult } from "./fit-check";
import { FONTS, type FontKey } from "@/lib/print/font-families";
import { useCode } from "./code-image";
import { fill } from "@/lib/print/merge";
import { LeaveGuard } from "@/components/leave-guard";

export type EditorTemplate = TemplateSpec & { show_on_card: boolean; auto_on_first_checkin: boolean; copies: number };
export type MergeKey = { key: string; label: string; enabled: boolean };

const ICON = { text: Type, barcode: Barcode, qr: QrCode, box: Square, image: ImageIcon } as const;
const uid = () => Math.random().toString(36).slice(2, 8);
/** "{{LAST}}, {{FIRST}}" → "Last name, First name" for the parts list. */
const describe = (l: Layer, labels: Map<string, string>) => {
  const words = (t: string) => t.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, k: string) => k.split("|").map((x) => labels.get(x.trim()) ?? x.trim()).join(" or "));
  return l.type === "box" ? "Colour block" : l.type === "image" ? "Picture" : l.type === "text" ? words(l.text) || "Text" : `${l.type === "qr" ? "QR code" : "Barcode"}: ${words(l.text)}`;
};
/** Every field a template uses, including each choice in {{A|B}}. */
const usedKeys = (layers: Layer[]) =>
  new Set(
    layers.flatMap((l) =>
      [...("text" in l ? l.text : l.type === "box" ? (l.fill ?? "") : "").matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].flatMap((m) => m[1].split("|").map((k) => k.trim()).filter(Boolean)),
    ),
  );

const tidy = (n: number) => Math.round(n * 100) / 100;

/** Parts moved and shrunk just enough to be on a tag of w × h (when the size is typed by hand). */
function keepOnTag(layers: Layer[], w: number, h: number): Layer[] {
  return layers.map((l) => {
    const lw = Math.min(l.w, w);
    const lh = Math.min(l.h, h);
    return { ...l, w: lw, h: lh, x: tidy(Math.min(Math.max(0, l.x), w - lw)), y: tidy(Math.min(Math.max(0, l.y), h - lh)) };
  });
}

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

/**
 * The design turned a quarter (for a label printer fed the other way round): every part keeps
 * its place on the turned label, and text and barcodes turn with it. Clockwise, or back again
 * when it was turned before. Null when it can't (parts already turned both ways).
 */
function turnDesign(layers: Layer[], W: number, H: number): Layer[] | null {
  const turned = layers.map((l) => ("rotate" in l ? (l.rotate ?? 0) : 0));
  if (turned.includes(90) && turned.includes(-90)) return null;
  const back = turned.includes(90); // turned clockwise before: turn back
  return layers.map((l) => {
    const box = back ? { x: l.y, y: tidy(W - (l.x + l.w)), w: l.h, h: l.w } : { x: tidy(H - (l.y + l.h)), y: l.x, w: l.h, h: l.w };
    if (l.type === "text" || l.type === "barcode") return { ...l, ...box, rotate: ((l.rotate ?? 0) + (back ? -90 : 90)) as 0 | 90 | -90 };
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

/**
 * A number box that only passes on numbers it can use: while it's empty or half-typed ("-",
 * "2.") nothing changes, and leaving it puts the last good number back. Never a 0 by accident.
 */
function Num({ label, value, onChange, step = 0.5, min, max, whole }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; whole?: boolean }) {
  const [text, setText] = React.useState(Number.isFinite(value) ? String(value) : "");
  const focused = React.useRef(false);
  React.useEffect(() => {
    if (!focused.current) setText(Number.isFinite(value) ? String(value) : "");
  }, [value]);
  return (
    <label className="min-w-0 space-y-1">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={text}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() === "" || !Number.isFinite(n)) return;
          if ((min !== undefined && n < min) || (max !== undefined && n > max) || (whole && !Number.isInteger(n))) return;
          onChange(n);
        }}
        onBlur={() => {
          focused.current = false;
          // too big or too small: the nearest number that works (e.g. the biggest size the box holds)
          const n = Number(text);
          if (text.trim() !== "" && Number.isFinite(n)) {
            const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, whole ? Math.round(n) : n));
            if (c !== value) {
              onChange(c);
              setText(String(c));
              return;
            }
          }
          setText(Number.isFinite(value) ? String(value) : "");
        }}
        className="h-9"
      />
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

/**
 * Size and fitting for a text part, said plainly: the biggest size the box can hold, what
 * happens for the camper shown, and, measured for every camper, who'd be cut off and how to fix it.
 */
function TextSizes({
  l,
  fit,
  every,
  checking,
  camper,
  onChange,
  onShow,
}: {
  l: Extract<Layer, { type: "text" }>;
  fit: FitInfo | undefined;
  every: FitResult | undefined;
  checking: boolean;
  camper: string;
  onChange: (patch: Partial<Extract<Layer, { type: "text" }>>) => void;
  onShow: (code: string) => void;
}) {
  const cap = boxCapPt(l);
  const min = l.minSize ?? Math.min(DEFAULT_MIN_PT, l.size);
  const shrinks = l.fit !== false;
  const tone = (t: "ok" | "warn" | "bad") =>
    t === "bad"
      ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
      : t === "warn"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100";
  const names = (list: { name: string; code: string }[]) => (
    <span className="mt-1 flex flex-wrap gap-1">
      {list.slice(0, 6).map((c) => (
        <button key={c.code + c.name} type="button" onClick={() => c.code && onShow(c.code)} className="rounded border border-current/30 bg-white/60 px-1.5 py-0.5 text-[11px] font-medium hover:bg-white dark:bg-black/20" title="Show this camper on the tag" dir="auto">
          {c.name}
        </button>
      ))}
      {list.length > 6 && <span className="self-center text-[11px]">and {list.length - 6} more</span>}
    </span>
  );
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Num label="Text size (pt)" step={1} min={3} max={cap} value={Math.min(l.size, Math.max(cap, 3))} onChange={(n) => onChange({ size: n, ...(l.minSize !== undefined && l.minSize > n ? { minSize: n } : {}) })} />
        {shrinks ? (
          <Num label="Never smaller than (pt)" step={1} min={3} max={l.size} value={min} onChange={(n) => onChange({ minSize: n })} />
        ) : (
          <p className="self-end pb-2 text-xs text-muted-foreground">Doesn&apos;t shrink: long text is cut off.</p>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        This box holds text up to {cap} pt.
        {l.size > cap ? (
          <button type="button" className="font-medium text-red-700 underline dark:text-red-300" onClick={() => onChange({ size: cap, ...(min > cap ? { minSize: cap } : {}) })}>
            {l.size} pt is too big for it: use {cap} pt
          </button>
        ) : (
          l.size < cap && (
            <button type="button" className="text-primary hover:underline" onClick={() => onChange({ size: cap })}>
              Use the biggest
            </button>
          )
        )}
      </p>
      {fit && (
        <p className={cn("rounded-md border px-2.5 py-2 text-sm", tone(fit.overflow ? "bad" : fit.pt < l.size ? "warn" : "ok"))}>
          {fit.overflow ? (
            <>
              <strong>Cut off</strong> for {camper || "this camper"}, even at {min} pt.
            </>
          ) : fit.pt < l.size ? (
            <>
              Shrinks to <strong>{fit.pt} pt</strong> for {camper || "this camper"}.
            </>
          ) : (
            <>
              Fits at <strong>{l.size} pt</strong> for {camper || "this camper"}.
            </>
          )}
        </p>
      )}
      <div className={cn("rounded-md border px-2.5 py-2 text-sm", every ? tone(every.cut.length ? "bad" : every.smallest && every.smallest.pt < l.size ? "warn" : "ok") : "bg-muted text-muted-foreground")}>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Every camper</p>
        {!every ? (
          <p className="text-xs">{checking ? "Checking every camper…" : "Nothing to check: this part has no fields."}</p>
        ) : every.cut.length ? (
          <>
            <p>
              <strong>
                {every.cut.length} of {every.checked}
              </strong>{" "}
              {every.cut.length === 1 ? "camper is" : "campers are"} cut off{shrinks ? ` even at ${min} pt` : ""}:
            </p>
            {names(every.cut)}
            <span className="mt-2 flex flex-wrap gap-1.5">
              {shrinks && every.needPt !== null && every.needPt >= 4 && every.needPt < min && (
                <Button size="sm" variant="outline" className="h-7 bg-white/70 text-xs dark:bg-black/20" onClick={() => onChange({ minSize: every.needPt! })}>
                  Let it shrink to {every.needPt} pt
                </Button>
              )}
              {!shrinks && (
                <Button size="sm" variant="outline" className="h-7 bg-white/70 text-xs dark:bg-black/20" onClick={() => onChange({ fit: true })}>
                  Shrink long text
                </Button>
              )}
              {!l.wrap && (
                <Button size="sm" variant="outline" className="h-7 bg-white/70 text-xs dark:bg-black/20" onClick={() => onChange({ wrap: true })}>
                  Allow 2 lines
                </Button>
              )}
            </span>
            <p className="mt-1 text-xs opacity-80">Or make the box wider.</p>
          </>
        ) : every.checked ? (
          <p>
            All {every.checked} fit.
            {every.smallest && every.smallest.pt < l.size ? (
              <>
                {" "}
                Smallest is <strong>{every.smallest.pt} pt</strong>:
                {names([every.smallest])}
              </>
            ) : (
              <> Everyone prints at {l.size} pt.</>
            )}
          </p>
        ) : (
          <p className="text-xs">No camper has anything in this part.</p>
        )}
      </div>
    </div>
  );
}

export function TemplateEditor({
  initial,
  fields,
  background,
  backgroundUrl,
  pictures = {},
}: {
  initial: EditorTemplate;
  fields: MergeKey[];
  background: React.ReactNode;
  backgroundUrl: string | null;
  /** Pictures the template's picture parts show, by stored path. */
  pictures?: Record<string, string>;
}) {
  const router = useRouter();
  const [t, setT] = React.useState<EditorTemplate>(() => ({ ...initial, layers: initial.layers.map((l) => ({ ...l, id: l.id || uid() })) }));
  const [selected, setSelected] = React.useState<string | null>(null);
  const selectedRef = React.useRef<string | null>(null);
  selectedRef.current = selected;
  const [fits, setFits] = React.useState<Record<string, FitInfo>>({});
  const [sample, setSample] = React.useState<{ values: Record<string, string>; label: string }>({ values: {}, label: "" });
  const [who, setWho] = React.useState<"sample" | "longest" | "code">("sample");
  const [code, setCode] = React.useState("");
  const [saving, startSave] = React.useTransition();
  const [dirty, setDirty] = React.useState(false);
  // each change bumps the version, so a save only clears "unsaved" if nothing changed while it ran
  const version = React.useRef(0);
  const markDirty = React.useCallback(() => {
    version.current++;
    setDirty(true);
  }, []);
  const [preview, setPreview] = React.useState<string | null>(null);
  const frame = React.useRef<HTMLIFrameElement>(null);
  const [picking, setPicking] = React.useState(false);
  // every camper's values for the fields used, to measure each text part for everyone
  const [people, setPeople] = React.useState<FitPerson[] | null>(null);
  const [fitResults, setFitResults] = React.useState<Record<string, FitResult>>({});

  // Undo / redo: a snapshot before each change. Changes to the same thing in quick succession
  // (a drag, typing a word, nudging) are one step.
  const tRef = React.useRef(t);
  tRef.current = t;
  const past = React.useRef<EditorTemplate[]>([]);
  const future = React.useRef<EditorTemplate[]>([]);
  const lastStep = React.useRef<{ key: string; at: number } | null>(null);
  const [, historyChanged] = React.useReducer((n: number) => n + 1, 0);
  const remember = React.useCallback((key: string) => {
    const now = Date.now();
    if (lastStep.current?.key === key && now - lastStep.current.at < 800) {
      lastStep.current.at = now;
      return;
    }
    past.current.push(tRef.current);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    lastStep.current = { key, at: now };
    historyChanged();
  }, []);
  const step = React.useCallback((from: React.RefObject<EditorTemplate[]>, to: React.RefObject<EditorTemplate[]>) => {
    const snap = from.current.pop();
    if (!snap) return;
    to.current.push(tRef.current);
    lastStep.current = null;
    setT(snap);
    markDirty();
    setSelected((id) => (id && snap.layers.some((l) => l.id === id) ? id : null));
    historyChanged();
  }, [markDirty]);
  const undo = React.useCallback(() => step(past, future), [step]);
  const redo = React.useCallback(() => step(future, past), [step]);

  const update = (patch: Partial<EditorTemplate>) => {
    remember(`t:${Object.keys(patch).sort().join()}`);
    setT((cur) => ({ ...cur, ...patch }));
    markDirty();
  };
  const setLayer = React.useCallback(
    (id: string, patch: Partial<Layer>) => {
      remember(`l:${id}:${Object.keys(patch).sort().join()}`);
      setT((cur) => ({ ...cur, layers: cur.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) }));
      markDirty();
    },
    [remember, markDirty],
  );
  const remove = React.useCallback(
    (id: string) => {
      remember(`rm:${id}`);
      setT((cur) => ({ ...cur, layers: cur.layers.filter((l) => l.id !== id) }));
      setSelected(null);
      markDirty();
    },
    [remember, markDirty],
  );
  const add = (l: Omit<Layer, "id">) => {
    const id = uid();
    remember(`add:${id}`);
    // colour blocks go to the back (they're backgrounds and strips); everything else on top
    setT((cur) => ({ ...cur, layers: l.type === "box" ? [{ ...l, id } as Layer, ...cur.layers] : [...cur.layers, { ...l, id } as Layer] }));
    setSelected(id);
    markDirty();
    (document.activeElement as HTMLElement | null)?.blur();
  };
  // pictures (a camp logo…): uploaded, then placed at their own shape, 20 mm wide
  const [images, setImages] = React.useState<Record<string, string>>(pictures);
  const [uploading, setUploading] = React.useState(false);
  const pictureInput = React.useRef<HTMLInputElement>(null);
  const replacing = React.useRef<string | null>(null);
  const pickPicture = (replace: string | null) => {
    replacing.current = replace;
    pictureInput.current?.click();
  };
  const uploadPicture = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) return void toast.error("Pictures up to 2 MB, please (a logo rarely needs more). Save it smaller and try again.");
    setUploading(true);
    try {
      const ratio = await createImageBitmap(file)
        .then((b) => b.height / b.width)
        .catch(() => 1);
      const fd = new FormData();
      fd.append("file", file);
      const r = await uploadTemplateImage(fd).catch(() => ({ ok: false as const, error: "That didn't upload. Check the connection and try again." }));
      if (!r.ok) return void toast.error(r.error);
      setImages((cur) => ({ ...cur, [r.path]: r.url }));
      if (replacing.current) setLayer(replacing.current, { path: r.path } as Partial<Layer>);
      else {
        const w = Math.min(20, W - 2);
        const h = Math.min(Math.max(2, tidy(w * ratio)), H);
        add({ type: "image", path: r.path, fit: "contain", ...center(w, h) } as Omit<Layer, "id">);
      }
    } finally {
      setUploading(false);
    }
  };

  /** A copy of a part, a little down and to the right (still on the tag), selected. */
  const duplicate = React.useCallback(
    (id: string) => {
      const l = tRef.current.layers.find((x) => x.id === id);
      if (!l) return;
      const copy = { ...l, id: uid(), x: tidy(Math.min(l.x + 2, Math.max(0, tRef.current.page_width_mm - l.w))), y: tidy(Math.min(l.y + 2, Math.max(0, tRef.current.page_height_mm - l.h))) } as Layer;
      remember(`dup:${copy.id}`);
      setT((cur) => ({ ...cur, layers: [...cur.layers, copy] }));
      setSelected(copy.id);
      markDirty();
    },
    [remember, markDirty],
  );
  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, Ctrl/Cmd+D duplicate (text boxes keep their own undo)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = e.target as HTMLElement | null;
      const typing = el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      const k = e.key.toLowerCase();
      if (k === "d" && selectedRef.current && !typing) {
        e.preventDefault();
        duplicate(selectedRef.current);
      } else if (!typing && ((k === "z" && e.shiftKey) || k === "y")) {
        e.preventDefault();
        redo();
      } else if (!typing && k === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duplicate, undo, redo]);
  const move = (i: number, d: -1 | 1) => {
    const ls = [...t.layers];
    const j = i + d;
    if (j < 0 || j >= ls.length) return;
    [ls[i], ls[j]] = [ls[j], ls[i]];
    update({ layers: ls });
  };
  const onFit = React.useCallback((id: string, info: FitInfo) => setFits((cur) => (cur[id]?.pt === info.pt && cur[id]?.overflow === info.overflow ? cur : { ...cur, [id]: info })), []);

  // whose details fill the canvas; "longest" looks for the camper whose text is longest for its
  // box on this template's parts (checked again a moment after the parts change)
  const textsKey = JSON.stringify(t.layers.filter((l) => l.type === "text").map((l) => ({ text: (l as { text: string }).text, w: l.w })));
  const whoArg = React.useMemo(
    () => (who === "code" ? ({ kind: "code", code } as const) : who === "longest" ? ({ kind: "longest", texts: JSON.parse(textsKey) } as const) : ({ kind: "sample" } as const)),
    [who, code, textsKey],
  );
  React.useEffect(() => {
    if (who === "code" && !/^\D*\d{6}\D*$/.test(code)) return;
    let live = true;
    const timer = setTimeout(
      () =>
        previewValues(whoArg)
          .then((r) => {
            if (!live) return;
            if ("error" in r) toast.error(r.error);
            else setSample(r);
          })
          .catch(() => undefined),
      who === "longest" ? 600 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [whoArg, who, code]);

  const persist = async (leaving = false) => {
    const sent = version.current;
    const r = await saveTemplate({ ...t, id: t.id || undefined, kind: t.kind as "name_tag", layers: t.layers, sheet_layout: t.sheet_layout }).catch(() => ({
      ok: false as const,
      error: "Couldn't save: check the connection and try again. Your changes are still here.",
    }));
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    if (version.current === sent) {
      setDirty(false);
      clearDraft();
    }
    toast.success(r.message);
    if (leaving) return true;
    if (r.redirect) router.push(r.redirect);
    else router.refresh();
    return true;
  };
  const save = () => startSave(async () => void (await persist()));
  const saveRef = React.useRef(save);
  saveRef.current = save;
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // unsaved work is kept on this computer, so leaving by Back, a crash or a closed laptop loses nothing
  const draftKey = `kinus:template-draft:${initial.id ?? "new"}`;
  const [draft, setDraft] = React.useState<{ t: EditorTemplate; at: string } | null>(null);
  function clearDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {}
  }
  React.useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) ?? "null") as { t: EditorTemplate; at: string } | null;
      if (d?.t && JSON.stringify(d.t.layers) !== JSON.stringify(initial.layers) && Date.now() - Date.parse(d.at) < 14 * 86400_000) setDraft(d);
      else clearDraft();
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ t, at: new Date().toISOString() }));
      } catch {}
    }, 800);
    return () => clearTimeout(timer);
  }, [t, dirty, draftKey]);

  const W = t.page_width_mm;
  const H = t.page_height_mm;
  const center = (w: number, h: number) => ({ x: Math.max(0, Math.round((W - w) / 2)), y: Math.max(0, Math.round((H - h) / 2)), w: Math.min(w, W), h: Math.min(h, H) });
  const sel = t.layers.find((l) => l.id === selected) ?? null;
  const labels = new Map(fields.map((f) => [f.key, f.label]));
  const fit = sel ? fits[sel.id] : undefined;
  const used = [...usedKeys(t.layers)];
  const hidden = used.filter((k) => fields.some((f) => f.key === k && !f.enabled));
  // a field that doesn't exist prints nothing: usually a typo ({{BARCOD}}, {{first}})
  const unknown = used.filter((k) => !fields.some((f) => f.key === k)).map((k) => ({ key: k, like: fields.find((f) => f.key.toLowerCase() === k.toLowerCase() || f.key.replace(/_/g, "") === k.toUpperCase().replace(/[^A-Z0-9]/g, ""))?.key }));
  // the fit check: every camper's values for the fields this template uses (fetched again
  // when a new field is added), then each text part measured for each of them
  const knownUsed = used.filter((k) => fields.some((f) => f.key === k)).sort();
  const usedKey = knownUsed.join(",");
  React.useEffect(() => {
    let live = true;
    setPeople(null);
    fitCheckPeople(usedKey ? usedKey.split(",") : [])
      .then((r) => live && setPeople(r.ok ? r.people : []))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [usedKey]);
  const textLayersKey = JSON.stringify(t.layers.filter((l) => l.type === "text"));
  React.useEffect(() => {
    if (!people) return;
    let live = true;
    const timer = setTimeout(async () => {
      await document.fonts?.ready.catch(() => undefined);
      if (!live) return;
      const out: Record<string, FitResult> = {};
      for (const l of JSON.parse(textLayersKey) as Extract<Layer, { type: "text" }>[]) if (/\{\{/.test(l.text)) out[l.id] = checkFit(l, people);
      setFitResults(out);
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [people, textLayersKey]);
  const cutParts = Object.entries(fitResults).filter(([id, r]) => r.cut.length && t.layers.some((l) => l.id === id));
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
    const html = await previewTemplate(t, whoArg, { fullSheet: true });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const w = window.open(url, "_blank");
    if (!w) toast.error("Allow pop-ups for Kinus to print the test sheet.");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  return (
    <div className="space-y-4">
      <LeaveGuard dirty={dirty} onSave={() => persist(true)} />
      {draft && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
          <span className="mr-auto">
            You left this template with changes that weren&apos;t saved ({new Date(draft.at).toLocaleString()}).
          </span>
          <Button
            size="sm"
            onClick={() => {
              remember("draft");
              setT({ ...draft.t, id: t.id });
              markDirty();
              setDraft(null);
            }}
          >
            Bring them back
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              clearDraft();
              setDraft(null);
            }}
          >
            Throw them away
          </Button>
        </div>
      )}
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
            <option value="longest">The longest text (checks every camper)</option>
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
          <Button variant="outline" onClick={async () => setPreview(await previewTemplate(t, whoArg).catch(() => null))}>
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
            <Button size="sm" variant="outline" onClick={() => pickPicture(null)} disabled={uploading}>
              <ImageIcon /> {uploading ? "Uploading…" : "Picture"}
            </Button>
            <input
              ref={pictureInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) uploadPicture(f);
              }}
            />
            <span className="ml-auto flex gap-1">
              <Button size="icon" variant="ghost" className="size-9" onClick={undo} disabled={!past.current.length} aria-label="Undo" title="Undo (Ctrl+Z)">
                <Undo2 />
              </Button>
              <Button size="icon" variant="ghost" className="size-9" onClick={redo} disabled={!future.current.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
                <Redo2 />
              </Button>
            </span>
          </div>
          <div className="rounded-xl border bg-muted/60 p-4 sm:p-6">
            <TagCanvas
              width={W}
              height={H}
              layers={t.layers}
              values={sample.values}
              background={backgroundUrl}
              images={images}
              selected={selected}
              onSelect={setSelected}
              onChange={setLayer}
              onDelete={remove}
              onFit={onFit}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {sample.label && <>Showing {sample.label}. </>}
            Drag a part to move it, pull its handles to resize. Arrow keys nudge (Shift: 5 mm), Delete removes, Ctrl+D copies, Ctrl+Z undoes. Text stays inside its box.
          </p>
          {used.length > 0 && (
            <details className="rounded-lg border bg-card text-sm">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
                What the fields say for {sample.label || "this camper"}
                {used.some((k) => fields.some((f) => f.key === k) && !(sample.values[k] ?? "").trim()) && <span className="ml-1 text-amber-700 dark:text-amber-400">· some are empty</span>}
              </summary>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t px-3 py-2 text-xs">
                {used.map((k) => (
                  <React.Fragment key={k}>
                    <dt className="font-mono text-muted-foreground">{`{{${k}}}`}</dt>
                    <dd dir="auto" className={cn("truncate", !(sample.values[k] ?? "").trim() && "italic text-amber-700 dark:text-amber-400")}>
                      {(sample.values[k] ?? "").trim() || (fields.some((f) => f.key === k) ? "empty for this camper" : "not a field")}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            </details>
          )}
          {cutParts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>Text is cut off for some campers:</span>
              {cutParts.map(([id, r]) => {
                const l = t.layers.find((x) => x.id === id)!;
                return (
                  <button key={id} type="button" onClick={() => setSelected(id)} className="rounded border border-red-300 bg-white px-1.5 py-0.5 font-medium hover:bg-red-100 dark:border-red-800 dark:bg-transparent" dir="auto">
                    {describe(l, labels)}: {r.cut.length} {r.cut.length === 1 ? "camper" : "campers"}
                  </button>
                );
              })}
            </div>
          )}
          {unknown.length > 0 && (
            <p className="flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {unknown.map((u, i) => (
                  <React.Fragment key={u.key}>
                    {i > 0 && "; "}
                    <code>{`{{${u.key}}}`}</code> isn&apos;t a field{u.like ? <>: did you mean <code>{`{{${u.like}}}`}</code>?</> : ""}
                  </React.Fragment>
                ))}
                . It prints empty. Fields are listed under Fields &amp; conversions.
              </span>
            </p>
          )}
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
                  <h2 className="font-semibold">{sel.type === "text" ? "Text" : sel.type === "box" ? "Colour block" : sel.type === "image" ? "Picture" : sel.type === "qr" ? "QR code" : "Barcode"}</h2>
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => duplicate(sel.id)} title="Copy (Ctrl+D)">
                      <Copy /> Copy
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(sel.id)}>
                      <Trash2 /> Remove
                    </Button>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setLayer(sel.id, { x: tidy(Math.max(0, (W - sel.w) / 2)) })} title="Centre across the tag">
                    <AlignHorizontalJustifyCenter /> Centre across
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setLayer(sel.id, { y: tidy(Math.max(0, (H - sel.h) / 2)) })} title="Centre up and down on the tag">
                    <AlignVerticalJustifyCenter /> Centre up–down
                  </Button>
                </div>
                {sel.type === "image" && (
                  <div className="space-y-2">
                    <div className="inline-flex w-full gap-1 rounded-lg bg-muted p-1">
                      {(
                        [
                          ["contain", "Whole picture"],
                          ["cover", "Fill the box"],
                        ] as const
                      ).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setLayer(sel.id, { fit: v })}
                          aria-pressed={(sel.fit ?? "contain") === v}
                          className={cn("flex-1 rounded-md px-2 py-1 text-sm", (sel.fit ?? "contain") === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => pickPicture(sel.id)}>
                      <ImageIcon /> Another picture
                    </Button>
                  </div>
                )}
                {sel.type !== "box" && sel.type !== "image" && <MergeText key={sel.id} label={sel.type === "text" ? "Says" : "Code"} value={sel.text} onChange={(v) => setLayer(sel.id, { text: v })} fields={fields} />}
                {sel.type === "text" && (
                  <>
                    <TextSizes
                      l={sel}
                      fit={fit}
                      every={fitResults[sel.id]}
                      checking={people === null}
                      camper={sample.label}
                      onChange={(patch) => setLayer(sel.id, patch)}
                      onShow={(c) => {
                        setWho("code");
                        setCode(c);
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Select aria-label="Font" value={sel.font ?? "sans"} onChange={(e) => setLayer(sel.id, { font: e.target.value as FontKey })} className="h-9 w-auto flex-1">
                        {(Object.entries(FONTS) as [FontKey, (typeof FONTS)[FontKey]][]).map(([k, f]) => (
                          <option key={k} value={k}>
                            {f.label} ({f.sample})
                          </option>
                        ))}
                      </Select>
                      <Button size="icon" variant={sel.italic ? "default" : "outline"} className="size-9" onClick={() => setLayer(sel.id, { italic: !sel.italic })} aria-label="Italic" aria-pressed={Boolean(sel.italic)}>
                        <Italic />
                      </Button>
                      <Button size="icon" variant={sel.underline ? "default" : "outline"} className="size-9" onClick={() => setLayer(sel.id, { underline: !sel.underline })} aria-label="Underline" aria-pressed={Boolean(sel.underline)}>
                        <Underline />
                      </Button>
                    </div>
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
                    <Num label="Rounded corners (mm)" min={0} max={50} value={sel.radius ?? 0} onChange={(n) => setLayer(sel.id, { radius: n })} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant={sel.fill === "transparent" ? "default" : "outline"} onClick={() => setLayer(sel.id, { fill: "transparent", border: sel.border ?? "#111111" })}>
                        Outline only
                      </Button>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="checkbox" checked={Boolean(sel.border)} onChange={(e) => setLayer(sel.id, { border: e.target.checked ? "#111111" : undefined })} className="size-4" />
                        Border
                      </label>
                      {sel.border && (
                        <input type="color" value={/^#[0-9a-f]{6}$/i.test(sel.border) ? sel.border : "#111111"} onChange={(e) => setLayer(sel.id, { border: e.target.value })} className="h-8 w-10 cursor-pointer rounded border bg-transparent" aria-label="Border colour" />
                      )}
                    </div>
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
                    <Num label="Left" min={0} max={Math.max(0, W - sel.w)} value={sel.x} onChange={(n) => setLayer(sel.id, { x: n })} />
                    <Num label="Top" min={0} max={Math.max(0, H - sel.h)} value={sel.y} onChange={(n) => setLayer(sel.id, { y: n })} />
                    <Num label="Width" min={1} max={W - sel.x} value={sel.w} onChange={(n) => setLayer(sel.id, { w: n })} />
                    <Num label="Height" min={1} max={H - sel.y} value={sel.h} onChange={(n) => setLayer(sel.id, { h: n })} />
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
                      {(fits[l.id]?.overflow || fitResults[l.id]?.cut.length) && (
                        <span className="ml-auto flex shrink-0 items-center gap-1 rounded bg-red-100 px-1.5 text-[11px] font-medium text-red-800 dark:bg-red-950 dark:text-red-200" title="Cut off for some campers">
                          <AlertTriangle className="size-3" /> {fitResults[l.id]?.cut.length || "cut"}
                        </span>
                      )}
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
                    <Num label="Label width (mm)" min={10} max={600} value={W} onChange={(n) => update({ page_width_mm: n, sheet_layout: sheet ? { ...sheet, preset: undefined } : null, layers: keepOnTag(t.layers, n, H) })} />
                    <Num label="Label height (mm)" min={10} max={600} value={H} onChange={(n) => update({ page_height_mm: n, sheet_layout: sheet ? { ...sheet, preset: undefined } : null, layers: keepOnTag(t.layers, W, n) })} />
                  </div>
                  {!sheet && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        const layers = turnDesign(t.layers, W, H);
                        if (!layers) return void toast.error("Some parts are turned one way and some the other: turn them back to Across first.");
                        update({ page_width_mm: H, page_height_mm: W, layers });
                        if (t.layers.some((l) => l.type === "image")) toast.message("Pictures don't turn: check them.");
                      }}
                      title="For a label printer fed the other way round: the design turns with the label"
                    >
                      Turn the label sideways ({+H.toFixed(1)} × {+W.toFixed(1)} mm)
                    </Button>
                  )}
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
                      <Num label="Across" step={1} min={1} max={10} whole value={sheet.cols} onChange={(n) => setSheet({ cols: n })} />
                      <Num label="Down" step={1} min={1} max={30} whole value={sheet.rows} onChange={(n) => setSheet({ rows: n })} />
                      <Num label="First label from left (mm)" step={0.1} min={-20} max={200} value={placed!.left} onChange={(n) => setSheet({ leftMm: n })} />
                      <Num label="First label from top (mm)" step={0.1} min={-20} max={200} value={placed!.top} onChange={(n) => setSheet({ topMm: n })} />
                      <Num label="Left of one to left of next (mm)" step={0.1} min={1} max={300} value={placed!.pitchX} onChange={(n) => setSheet({ pitchXMm: n })} />
                      <Num label="Top of one to top of next (mm)" step={0.1} min={1} max={300} value={placed!.pitchY} onChange={(n) => setSheet({ pitchYMm: n })} />
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
                      <Num label="Move right (mm)" step={0.5} min={-10} max={10} value={sheet.shiftXMm ?? 0} onChange={(n) => setSheet({ shiftXMm: n })} />
                      <Num label="Move down (mm)" step={0.5} min={-10} max={10} value={sheet.shiftYMm ?? 0} onChange={(n) => setSheet({ shiftYMm: n })} />
                    </div>
                    <Button size="sm" variant="outline" onClick={testSheet}>
                      <Printer /> Print a test sheet
                    </Button>
                  </div>
                </details>
              )}
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  <span className="font-medium">How many per camper</span>
                  <span className="block text-xs text-muted-foreground">
                    For labels each camper needs more than one of (luggage, bedding…). Used for batches, requests from the camper card and automatic prints; it can still be changed each time.
                  </span>
                </span>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={t.copies}
                  onChange={(e) => update({ copies: Math.min(10, Math.max(1, Math.round(Number(e.target.value) || 1))) })}
                  className="w-20 shrink-0"
                  aria-label="How many per camper"
                />
              </label>
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
                  <span className="block text-xs text-muted-foreground">The first time each camper is checked in, this tag goes to the office print queue on its own, without anyone tapping. Only once per camper. These aren&apos;t emailed one by one: the office prints them together from the queue.</span>
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
