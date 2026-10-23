"use client";
import * as React from "react";
import { fill } from "@/lib/print/merge";
import { fitText } from "@/lib/print/fit";
import { CURVE_SCALE, curvePath, DEFAULT_ARC, fitCurve } from "@/lib/print/curve";
import { FLOOR_PT, minPt } from "@/lib/print/render-constants";
import { DIVISION_VALUE, pictureFor, textAlignItems, type Layer } from "@/lib/print/types";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeImage, useCode } from "./code-image";
import { fontStack, lineHeightOf } from "@/lib/print/font-families";

/** pt: the size it prints at; below: under the part's smallest size (to fit); overflow: cut off even so. */
export type FitInfo = { pt: number; overflow: boolean; below?: boolean };
export type Box = { x: number; y: number; w: number; h: number };
type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MM_PER_PT = 25.4 / 72;
const SNAP = 0.5; // mm grid
const GUIDE = 1.2; // mm: how close counts as "on" a centre or edge line
const round = (v: number) => Math.round(v / SNAP) * SNAP;
/** Trims float noise (152.4 − 132 = 20.400000000000006). */
const tidy = <T extends Record<string, number>>(b: T): T =>
  Object.fromEntries(
    Object.entries(b).map(([k, v]) => [k, Math.round(v * 100) / 100]),
  ) as T;
const safeColor = (c: string, fallback: string) =>
  /^#[0-9a-f]{3,8}$|^[a-z]+$/i.test(c.trim()) ? c.trim() : fallback;

/**
 * The tag at real proportions: click a part to select it, Shift-click (or drag a box around
 * parts) to select several, drag to move, pull the handles to resize, arrow keys to nudge
 * (Shift: 5 mm), Delete to remove. Parts snap to a 0.5 mm grid and to the tag's centre lines
 * and edges. Locked parts don't move (dragging over one draws a selection box instead);
 * hidden parts aren't shown. Text is shown for the chosen camper, shrunk exactly as it will print.
 */
export function TagCanvas({
  width,
  height,
  layers,
  values,
  background,
  images = {},
  selected,
  onSelect,
  onChange,
  onDelete,
  onFit,
  round: roundLabel,
}: {
  width: number;
  height: number;
  /** A round label: the tag shows as its circle, with the cut line marked. */
  round?: boolean;
  layers: Layer[];
  values: Record<string, string>;
  background: string | null;
  /** Pictures for picture parts, by stored path (data URLs). */
  images?: Record<string, string>;
  selected: string[];
  onSelect: (ids: string[]) => void;
  /** Moves or resizes, by part (several at once when a group is dragged). */
  onChange: (changes: Record<string, Partial<Box>>) => void;
  onDelete: (ids: string[]) => void;
  onFit: (id: string, info: FitInfo) => void;
}) {
  const wrap = React.useRef<HTMLDivElement>(null);
  const tag = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(4); // px per mm
  const [guides, setGuides] = React.useState<{ v: number[]; h: number[] }>({
    v: [],
    h: [],
  });
  const [band, setBand] = React.useState<Box | null>(null);
  const drag = React.useRef<Drag | null>(null);
  const movable = (ids: string[]) =>
    layers.filter((l) => ids.includes(l.id) && !l.locked && !l.hidden);

  // as large as the space allows, never taller than most of the screen
  React.useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const maxH = window.innerHeight * 0.62;
      setScale(Math.max(1, Math.min(el.clientWidth / width, maxH / height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  const snapBox = (
    b: Box,
    moving: boolean,
  ): { box: Box; v: number[]; h: number[] } => {
    const v: number[] = [];
    const h: number[] = [];
    const out = { ...b };
    if (moving) {
      // centre lines first, then edges
      const cx = out.x + out.w / 2;
      const cy = out.y + out.h / 2;
      if (Math.abs(cx - width / 2) < GUIDE) {
        out.x = width / 2 - out.w / 2;
        v.push(width / 2);
      } else if (Math.abs(out.x) < GUIDE) {
        out.x = 0;
        v.push(0);
      } else if (Math.abs(out.x + out.w - width) < GUIDE) {
        out.x = width - out.w;
        v.push(width);
      }
      if (Math.abs(cy - height / 2) < GUIDE) {
        out.y = height / 2 - out.h / 2;
        h.push(height / 2);
      } else if (Math.abs(out.y) < GUIDE) {
        out.y = 0;
        h.push(0);
      } else if (Math.abs(out.y + out.h - height) < GUIDE) {
        out.y = height - out.h;
        h.push(height);
      }
    }
    // parts stay on the tag
    if (moving) {
      const w = Math.min(Math.max(2, round(out.w)), width);
      const hh = Math.min(Math.max(2, round(out.h)), height);
      return {
        box: {
          x: Math.min(Math.max(0, round(out.x)), width - w),
          y: Math.min(Math.max(0, round(out.y)), height - hh),
          w,
          h: hh,
        },
        v,
        h,
      };
    }
    const x0 = Math.max(0, round(out.x));
    const y0 = Math.max(0, round(out.y));
    const x1 = Math.min(width, round(out.x + out.w));
    const y1 = Math.min(height, round(out.y + out.h));
    return {
      box: {
        x: Math.min(x0, width - 2),
        y: Math.min(y0, height - 2),
        w: Math.max(2, x1 - x0),
        h: Math.max(2, y1 - y0),
      },
      v,
      h,
    };
  };

  /** Where the pointer is on the tag, in mm. */
  const at = (e: React.PointerEvent) => {
    const r = tag.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.start.px) / scale;
    const dy = (e.clientY - d.start.py) / scale;
    if (Math.abs(e.clientX - d.start.px) + Math.abs(e.clientY - d.start.py) > 3)
      d.moved = true;
    if (d.kind === "band") {
      if (!d.moved) return;
      const p = at(e);
      d.rect = {
        x: Math.min(p.x, d.origin.x),
        y: Math.min(p.y, d.origin.y),
        w: Math.abs(p.x - d.origin.x),
        h: Math.abs(p.y - d.origin.y),
      };
      setBand(d.rect);
      return;
    }
    if (d.kind === "move") {
      if (!d.moved) return;
      // the group moves as one box: it snaps and stays on the tag together
      const s = snapBox(
        { ...d.bounds, x: d.bounds.x + dx, y: d.bounds.y + dy },
        true,
      );
      const ox = s.box.x - d.bounds.x;
      const oy = s.box.y - d.bounds.y;
      setGuides({ v: s.v, h: s.h });
      onChange(
        Object.fromEntries(
          Object.entries(d.boxes).map(([id, b]) => [
            id,
            tidy({ x: b.x + ox, y: b.y + oy }),
          ]),
        ),
      );
      return;
    }
    const b = { ...d.box };
    if (d.mode.includes("e")) b.w = d.box.w + dx;
    if (d.mode.includes("s")) b.h = d.box.h + dy;
    if (d.mode.includes("w")) {
      b.x = d.box.x + dx;
      b.w = d.box.w - dx;
    }
    if (d.mode.includes("n")) {
      b.y = d.box.y + dy;
      b.h = d.box.h - dy;
    }
    // never smaller than 2 mm; dragging past the opposite side stops there
    if (b.w < 2) {
      if (d.mode.includes("w")) b.x = d.box.x + d.box.w - 2;
      b.w = 2;
    }
    if (b.h < 2) {
      if (d.mode.includes("n")) b.y = d.box.y + d.box.h - 2;
      b.h = 2;
    }
    const s = snapBox(b, false);
    setGuides({ v: s.v, h: s.h });
    onChange({ [d.id]: tidy(s.box) });
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    setGuides({ v: [], h: [] });
    setBand(null);
    if (!d) return;
    if (d.kind === "band") {
      if (!d.moved) {
        // a click: on a locked part selects it (to unlock it), on the tag clears the selection
        onSelect(d.hit ? [d.hit] : d.add ? selected : []);
        return;
      }
      const r = d.rect ?? { x: 0, y: 0, w: 0, h: 0 };
      const inside = layers
        .filter(
          (l) =>
            !l.hidden &&
            !l.locked &&
            l.x < r.x + r.w &&
            l.x + l.w > r.x &&
            l.y < r.y + r.h &&
            l.y + l.h > r.y,
        )
        .map((l) => l.id);
      onSelect(d.add ? [...new Set([...selected, ...inside])] : inside);
    } else if (d.kind === "move" && !d.moved && d.only) onSelect([d.only]);
  };
  const startBand = (e: React.PointerEvent, hit: string | null) => {
    e.stopPropagation();
    e.preventDefault();
    wrap.current?.focus();
    tag.current?.setPointerCapture?.(e.pointerId);
    drag.current = {
      kind: "band",
      start: { px: e.clientX, py: e.clientY },
      origin: at(e),
      add: e.shiftKey || e.metaKey || e.ctrlKey,
      hit,
      moved: false,
    };
  };
  const start = (e: React.PointerEvent, l: Layer, mode: "move" | Handle) => {
    if (mode === "move" && l.locked) return startBand(e, l.id);
    e.stopPropagation();
    e.preventDefault();
    wrap.current?.focus();
    // Shift / Ctrl / ⌘-click adds a part to the selection, or takes it out
    if (mode === "move" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
      onSelect(
        selected.includes(l.id)
          ? selected.filter((id) => id !== l.id)
          : [...selected, l.id],
      );
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (mode !== "move") {
      drag.current = {
        kind: "resize",
        id: l.id,
        mode,
        start: { px: e.clientX, py: e.clientY },
        box: { x: l.x, y: l.y, w: l.w, h: l.h },
        moved: false,
      };
      return;
    }
    // dragging a selected part takes the whole selection along
    const group = selected.includes(l.id) ? selected : [l.id];
    if (!selected.includes(l.id)) onSelect([l.id]);
    const parts = movable(group);
    drag.current = {
      kind: "move",
      start: { px: e.clientX, py: e.clientY },
      boxes: Object.fromEntries(
        parts.map((p) => [p.id, { x: p.x, y: p.y, w: p.w, h: p.h }]),
      ),
      bounds: boundsOf(parts),
      moved: false,
      // a plain click on one part of a group selects just that part
      only: group.length > 1 ? l.id : null,
    };
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)
    )
      return;
    if (document.querySelector("[role=dialog]")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      onSelect(layers.filter((l) => !l.hidden && !l.locked).map((l) => l.id));
      return;
    }
    if (!selected.length) return;
    const step = e.shiftKey ? 5 : SNAP;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (move[e.key]) {
      e.preventDefault();
      const parts = movable(selected);
      if (!parts.length) return;
      // the group stays on the tag: it stops at the edge
      const b = boundsOf(parts);
      const dx = Math.min(Math.max(move[e.key][0], -b.x), Math.max(0, width - b.x - b.w));
      const dy = Math.min(Math.max(move[e.key][1], -b.y), Math.max(0, height - b.y - b.h));
      const one = parts.length === 1;
      onChange(
        Object.fromEntries(
          parts.map((p) => [
            p.id,
            tidy({
              x: one ? round(p.x + dx) : p.x + dx,
              y: one ? round(p.y + dy) : p.y + dy,
            }),
          ]),
        ),
      );
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      // locked parts stay (remove them from the side panel)
      const ids = layers.filter((l) => selected.includes(l.id) && !l.locked).map((l) => l.id);
      if (ids.length) onDelete(ids);
    } else if (e.key === "Escape") onSelect([]);
  };

  const keys = React.useRef(onKeyDown);
  keys.current = onKeyDown;
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const chosen = layers.filter((l) => selected.includes(l.id));
  return (
    <div
      ref={wrap}
      tabIndex={-1}
      className="w-full outline-none"
      aria-label="Tag canvas: click a part to select it, Shift-click to select more, drag to move, arrow keys to nudge"
    >
      <div
        ref={tag}
        className="relative mx-auto touch-none select-none bg-white shadow-[0_1px_6px_rgba(0,0,0,.18)] [font-family:'Kinus_Sans','Noto_Sans','Noto_Sans_Hebrew',Arial,sans-serif]"
        style={{ width: width * scale, height: height * scale, borderRadius: roundLabel ? "50%" : undefined }}
        onPointerDown={(e) => startBand(e, null)}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {background && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={background}
            alt=""
            className={cn("pointer-events-none absolute inset-0 size-full object-cover", roundLabel && "rounded-full")}
          />
        )}
        {/* where a round label is cut: anything outside the circle doesn't print */}
        {roundLabel && <div aria-hidden className="pointer-events-none absolute inset-0 z-20 rounded-full border border-dashed border-slate-400" />}
        {layers.map((l) =>
          l.hidden ? null : (
            <Part
              key={l.id}
              l={l}
              scale={scale}
              values={values}
              images={images}
              selected={selected.includes(l.id)}
              onStart={start}
              onFit={onFit}
            />
          ),
        )}
        {chosen.map((l) => (
          <Selection
            key={l.id}
            l={l}
            scale={scale}
            handles={chosen.length === 1 && !l.locked && !l.hidden}
            onStart={start}
          />
        ))}
        {band && (
          <div
            className="pointer-events-none absolute z-40 border border-primary bg-primary/10"
            style={{
              left: band.x * scale,
              top: band.y * scale,
              width: band.w * scale,
              height: band.h * scale,
            }}
          />
        )}
        {guides.v.map((x) => (
          <div
            key={`v${x}`}
            className="pointer-events-none absolute inset-y-0 w-px bg-fuchsia-500"
            style={{ left: x * scale }}
          />
        ))}
        {guides.h.map((y) => (
          <div
            key={`h${y}`}
            className="pointer-events-none absolute inset-x-0 h-px bg-fuchsia-500"
            style={{ top: y * scale }}
          />
        ))}
      </div>
    </div>
  );
}

type Drag = { start: { px: number; py: number }; moved: boolean } & (
  | { kind: "move"; boxes: Record<string, Box>; bounds: Box; only: string | null }
  | { kind: "resize"; id: string; mode: Handle; box: Box }
  | { kind: "band"; origin: { x: number; y: number }; add: boolean; hit: string | null; rect?: Box }
);

/** The box around several parts. */
export function boundsOf(parts: Box[]): Box {
  if (!parts.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...parts.map((p) => p.x));
  const y = Math.min(...parts.map((p) => p.y));
  return {
    x,
    y,
    w: Math.max(...parts.map((p) => p.x + p.w)) - x,
    h: Math.max(...parts.map((p) => p.y + p.h)) - y,
  };
}

function Part({
  l,
  scale,
  values,
  images,
  selected,
  onStart,
  onFit,
}: {
  l: Layer;
  scale: number;
  values: Record<string, string>;
  images: Record<string, string>;
  selected: boolean;
  onStart: (e: React.PointerEvent, l: Layer, mode: "move" | Handle) => void;
  onFit: (id: string, info: FitInfo) => void;
}) {
  const turned =
    (l.type === "text" || l.type === "barcode") && l.rotate ? l.rotate : 0;
  // inside a turned part, content is laid out across the turned box
  const innerW = (turned ? l.h : l.w) * scale;
  const innerH = (turned ? l.w : l.h) * scale;
  const inner: React.CSSProperties = turned
    ? {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: innerW,
        height: innerH,
        transform: `translate(-50%,-50%) rotate(${turned}deg)`,
      }
    : { position: "absolute", inset: 0 };

  return (
    <div
      // a selected part keeps its place in the stack (a full-tag colour block doesn't cover the text); its outline and handles are drawn on top
      className={cn(
        "absolute",
        l.locked ? "cursor-default" : "cursor-move",
        selected
          ? ""
          : "outline outline-1 outline-dashed outline-slate-300 hover:outline-primary/60",
      )}
      style={{
        left: l.x * scale,
        top: l.y * scale,
        width: l.w * scale,
        height: l.h * scale,
      }}
      onPointerDown={(e) => onStart(e, l, "move")}
    >
      <div style={inner} className="pointer-events-none overflow-hidden">
        {l.type === "text" &&
          (l.curve ? (
            <CurvedPart l={l} values={values} onFit={onFit} />
          ) : (
            <TextPart l={l} scale={scale} values={values} onFit={onFit} />
          ))}
        {l.type === "box" && (
          <div
            className="size-full"
            style={{
              background: safeColor(
                fill(l.fill ?? "", (k) => values[k] ?? ""),
                "transparent",
              ),
              borderRadius: (l.radius ?? 0) * scale,
              border: l.border
                ? `${0.3 * scale}px solid ${safeColor(l.border, "#000")}`
                : undefined,
            }}
          />
        )}
        {l.type === "barcode" && (
          <BarcodePart l={l} scale={scale} values={values} />
        )}
        {l.type === "qr" &&
          (fill(l.text, (k) => values[k] ?? "").trim() ? (
            <QrPart text={fill(l.text, (k) => values[k] ?? "")} color={l.color} round={l.shape === "round"} />
          ) : (
            <EmptyCode what="QR code" />
          ))}
        {l.type === "image" &&
          (images[pictureFor(l, values[DIVISION_VALUE])] ? (
            <div
              className="size-full bg-center bg-no-repeat"
              style={{
                backgroundImage: `url("${images[pictureFor(l, values[DIVISION_VALUE])]}")`,
                backgroundSize: l.fit === "cover" ? "cover" : "contain",
              }}
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-slate-100 text-[10px] text-slate-500">
              {pictureFor(l, values[DIVISION_VALUE]) ? "Picture" : "No picture for this division"}
            </div>
          ))}
      </div>
    </div>
  );
}

/** A selected part's outline (and, when it's the only one, its resize handles), above everything; only the handles take clicks. */
function Selection({
  l,
  scale,
  handles,
  onStart,
}: {
  l: Layer;
  scale: number;
  handles: boolean;
  onStart: (e: React.PointerEvent, l: Layer, mode: "move" | Handle) => void;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-30 outline outline-2",
        l.locked ? "outline-amber-500" : "outline-primary",
        l.hidden && "outline-dashed",
      )}
      style={{
        left: l.x * scale,
        top: l.y * scale,
        width: l.w * scale,
        height: l.h * scale,
      }}
    >
      {(l.locked || l.hidden) && (
        <span className="absolute -top-5 left-0 flex items-center gap-0.5 whitespace-nowrap rounded bg-amber-500 px-1 text-[10px] font-semibold leading-4 text-white">
          {l.locked && <Lock className="size-2.5" />}
          {[l.locked && "Locked", l.hidden && "Hidden"].filter(Boolean).join(" · ")}
        </span>
      )}
      {handles &&
        HANDLES.map((h) => (
          <span
            key={h}
            onPointerDown={(e) => onStart(e, l, h)}
            className="pointer-events-auto absolute size-3 rounded-sm border-2 border-primary bg-white"
            style={{
              left: h.includes("w")
                ? -6
                : h.includes("e")
                  ? "calc(100% - 6px)"
                  : "calc(50% - 6px)",
              top: h.includes("n")
                ? -6
                : h.includes("s")
                  ? "calc(100% - 6px)"
                  : "calc(50% - 6px)",
              cursor: `${h}-resize`,
            }}
          />
        ))}
    </div>
  );
}

/** A code with nothing in it for this camper: prints as an empty box, so it shows as one. */
function EmptyCode({ what }: { what: string }) {
  return (
    <div className="flex size-full items-center justify-center bg-red-50 p-0.5 text-center text-[10px] leading-tight text-red-700 outline outline-1 outline-red-300">
      {what} is empty for this camper
    </div>
  );
}

function BarcodePart({
  l,
  scale,
  values,
}: {
  l: Extract<Layer, { type: "barcode" }>;
  scale: number;
  values: Record<string, string>;
}) {
  const text = fill(l.text, (k) => values[k] ?? "");
  const code = useCode("barcode", text);
  if (!text.trim()) return <EmptyCode what="Barcode" />;
  return (
    <div className="flex size-full flex-col bg-white">
      <div className="min-h-0 flex-1">
        {code?.svg ? (
          <CodeImage svg={code.svg} stretch color={l.color} />
        ) : (
          <div className="size-full bg-slate-200" />
        )}
      </div>
      {l.showText !== false && (
        <div
          className="text-center leading-[1.2]"
          style={{
            color: l.color,
            fontSize: 7 * MM_PER_PT * scale,
            letterSpacing: 0.5 * MM_PER_PT * scale,
            paddingTop: 0.4 * scale,
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

function QrPart({ text, color, round }: { text: string; color?: string; round?: boolean }) {
  const code = useCode(round ? "qr-round" : "qr", text);
  return code?.svg ? (
    <CodeImage svg={code.svg} color={color} />
  ) : (
    <div className="size-full bg-slate-200" />
  );
}

/** On the tag: text cut off (red), or printing under its smallest size to fit (amber). */
function FitMark({ cut }: { cut: "cut" | "small" | null }) {
  if (!cut) return null;
  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-0 z-10",
        cut === "cut"
          ? "shadow-[inset_0_0_0_2px_#dc2626]"
          : "shadow-[inset_0_0_0_2px_#f59e0b]",
      )}
    >
      <span
        className={cn(
          "absolute right-0 top-0 rounded-bl px-1 text-[9px] font-semibold leading-tight text-white",
          cut === "cut" ? "bg-red-600" : "bg-amber-500",
        )}
      >
        {cut === "cut" ? "Cut off" : "Smaller to fit"}
      </span>
    </span>
  );
}

/** Text along the top or bottom of the circle in its box, fitted like the printed page (lib/print/curve). */
function CurvedPart({
  l,
  values,
  onFit,
}: {
  l: Extract<Layer, { type: "text" }>;
  values: Record<string, string>;
  onFit: (id: string, info: FitInfo) => void;
}) {
  const textRef = React.useRef<SVGTextElement>(null);
  const pathRef = React.useRef<SVGPathElement>(null);
  const id = `kc${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [cut, setCut] = React.useState<"cut" | "small" | null>(null);
  const text = fill(l.text, (k) => values[k] ?? "");
  const fields = [...l.text.matchAll(/\{\{[^{}]+\}\}/g)];
  const skipped =
    fields.length > 0 &&
    fields.every((m) => fill(m[0], (k) => values[k] ?? "").trim() === "");
  const empty = text.trim() === "" || skipped;
  const side = l.curve ?? "top";
  const arc = l.arc ?? DEFAULT_ARC;
  const sizeMm = l.size * MM_PER_PT;
  React.useLayoutEffect(() => {
    const run = () => {
      if (!textRef.current || !pathRef.current) return;
      const r = fitCurve(textRef.current, pathRef.current, {
        w: l.w,
        h: l.h,
        side,
        arc,
        sizeMm,
        minMm: minPt(l) * MM_PER_PT,
        floorMm: Math.min(FLOOR_PT, minPt(l)) * MM_PER_PT,
        fit: l.fit !== false && !empty,
      });
      const over = r.overflow && !empty;
      setCut(over ? "cut" : r.below ? "small" : null);
      onFit(l.id, { pt: Math.round((r.sizeMm / MM_PER_PT) * 2) / 2, overflow: over, below: r.below });
    };
    run();
    document.fonts?.ready.then(run).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the part's own values, not the object
  }, [text, side, arc, sizeMm, l.w, l.h, l.fit, l.minSize, l.weight, l.font, l.italic, l.id, empty, onFit]);
  return (
    <>
      <FitMark cut={cut} />
      <svg viewBox={`0 0 ${l.w * CURVE_SCALE} ${l.h * CURVE_SCALE}`} width="100%" height="100%" className="block overflow-visible" style={{ opacity: skipped ? 0.45 : undefined }}>
        <path ref={pathRef} id={id} d={curvePath(l.w, l.h, side, arc, sizeMm).d} fill="none" />
        <text
          ref={textRef}
          fontSize={sizeMm * CURVE_SCALE}
          fontWeight={l.weight ?? 400}
          fontFamily={fontStack(l.font)}
          fontStyle={empty || l.italic ? "italic" : undefined}
          textDecoration={l.underline ? "underline" : undefined}
          fill={empty ? "#94a3b8" : safeColor(l.color ?? "#111111", "#111111")}
          textAnchor="middle"
          dominantBaseline="central"
        >
          <textPath href={`#${id}`} startOffset="50%">
            {empty ? l.text : text}
          </textPath>
        </text>
      </svg>
    </>
  );
}

function TextPart({
  l,
  scale,
  values,
  onFit,
}: {
  l: Extract<Layer, { type: "text" }>;
  scale: number;
  values: Record<string, string>;
  onFit: (id: string, info: FitInfo) => void;
}) {
  const box = React.useRef<HTMLDivElement>(null);
  const span = React.useRef<HTMLSpanElement>(null);
  // cut off, or printing under its smallest size to fit: shown on the tag, not only in the side panel
  const [cut, setCut] = React.useState<"cut" | "small" | null>(null);
  const text = fill(l.text, (k) => values[k] ?? "");
  // like print: "T-shirt: {{TSHIRT}}" with no T-shirt prints nothing at all
  const fields = [...l.text.matchAll(/\{\{[^{}]+\}\}/g)];
  const skipped =
    fields.length > 0 &&
    fields.every((m) => fill(m[0], (k) => values[k] ?? "").trim() === "");
  const empty = text.trim() === "" || skipped;
  // 1 pt = 0.3528 mm; on the canvas, mm are `scale` px
  const target = l.size * MM_PER_PT * scale;
  const min = minPt(l) * MM_PER_PT * scale;
  const floor = Math.min(FLOOR_PT, minPt(l)) * MM_PER_PT * scale;
  React.useLayoutEffect(() => {
    if (!box.current || !span.current) return;
    const run = () => {
      if (!box.current || !span.current) return;
      if (l.fit === false || empty) {
        box.current.style.fontSize = `${target}px`;
        const over =
          !empty &&
          (span.current.scrollWidth > box.current.clientWidth + 0.5 ||
            box.current.scrollHeight > box.current.clientHeight + 0.5);
        setCut(over ? "cut" : null);
        onFit(l.id, { pt: l.size, overflow: over });
        return;
      }
      const r = fitText(box.current, span.current, target, min, floor);
      setCut(r.overflow ? "cut" : r.below ? "small" : null);
      onFit(l.id, {
        pt: Math.round((r.px / (MM_PER_PT * scale)) * 2) / 2,
        overflow: r.overflow,
        below: r.below,
      });
    };
    run();
    // measure again once the print fonts have loaded
    document.fonts?.ready.then(run).catch(() => undefined);
  }, [
    text,
    target,
    min,
    floor,
    l.fit,
    l.wrap,
    l.valign,
    l.lineHeight,
    l.w,
    l.h,
    l.rotate,
    l.weight,
    l.font,
    l.italic,
    l.id,
    l.size,
    empty,
    scale,
    onFit,
  ]);
  return (
    <>
      <FitMark cut={cut} />
      <div
        ref={box}
        className={cn(
          "flex size-full overflow-hidden",
          l.wrap ? "whitespace-normal" : "whitespace-nowrap",
        )}
        style={{
          fontWeight: l.weight ?? 400,
          color: empty ? "#94a3b8" : safeColor(l.color ?? "#111111", "#111111"),
          textAlign: l.align ?? "left",
          justifyContent:
            l.align === "center"
              ? "center"
              : l.align === "right"
                ? "flex-end"
                : "flex-start",
          alignItems: textAlignItems(l),
          fontStyle: empty || l.italic ? "italic" : undefined,
          fontFamily: fontStack(l.font),
          lineHeight: l.lineHeight ?? lineHeightOf(l.font),
          opacity: skipped ? 0.45 : undefined,
        }}
        title={
          skipped
            ? "Prints nothing for this camper: its fields are empty"
            : undefined
        }
      >
        <span
          ref={span}
          dir="auto"
          // clipped to its line like the printed page, so the size measured here is the printed size
          className="max-w-full overflow-hidden [unicode-bidi:plaintext]"
          style={{ textDecoration: l.underline ? "underline" : undefined, textWrap: l.wrap ? "balance" : undefined }}
        >
          {empty ? l.text : text}
        </span>
      </div>
    </>
  );
}
