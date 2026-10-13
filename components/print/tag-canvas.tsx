"use client";
import * as React from "react";
import { fill } from "@/lib/print/merge";
import { fitText } from "@/lib/print/fit";
import { DEFAULT_MIN_PT } from "@/lib/print/render-constants";
import type { Layer } from "@/lib/print/types";
import { cn } from "@/lib/utils";
import { CodeImage, useCode } from "./code-image";
import { fontStack } from "@/lib/print/font-families";

export type FitInfo = { pt: number; overflow: boolean };
type Box = { x: number; y: number; w: number; h: number };
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
 * The tag at real proportions: click a part to select it, drag to move, pull the handles
 * to resize, arrow keys to nudge (Shift: 5 mm), Delete to remove. Parts snap to a 0.5 mm
 * grid and to the tag's centre lines and edges. Text is shown for the chosen camper,
 * shrunk exactly as it will print.
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
}: {
  width: number;
  height: number;
  layers: Layer[];
  values: Record<string, string>;
  background: string | null;
  /** Pictures for picture parts, by stored path (data URLs). */
  images?: Record<string, string>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, box: Partial<Box>) => void;
  onDelete: (id: string) => void;
  onFit: (id: string, info: FitInfo) => void;
}) {
  const wrap = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(4); // px per mm
  const [guides, setGuides] = React.useState<{ v: number[]; h: number[] }>({
    v: [],
    h: [],
  });
  const drag = React.useRef<{
    id: string;
    mode: "move" | Handle;
    start: { px: number; py: number };
    box: Box;
  } | null>(null);

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

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.start.px) / scale;
    const dy = (e.clientY - d.start.py) / scale;
    const b = { ...d.box };
    if (d.mode === "move") {
      b.x += dx;
      b.y += dy;
    } else {
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
    }
    const s = snapBox(b, d.mode === "move");
    setGuides({ v: s.v, h: s.h });
    onChange(d.id, tidy(s.box));
  };
  const endDrag = () => {
    drag.current = null;
    setGuides({ v: [], h: [] });
  };
  const start = (e: React.PointerEvent, l: Layer, mode: "move" | Handle) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(l.id);
    wrap.current?.focus();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = {
      id: l.id,
      mode,
      start: { px: e.clientX, py: e.clientY },
      box: { x: l.x, y: l.y, w: l.w, h: l.h },
    };
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const l = layers.find((x) => x.id === selected);
    if (!l) return;
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)
    )
      return;
    if (document.querySelector("[role=dialog]")) return;
    const step = e.shiftKey ? 5 : SNAP;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (move[e.key]) {
      e.preventDefault();
      onChange(
        l.id,
        tidy({
          x: Math.min(Math.max(0, round(l.x + move[e.key][0])), width - l.w),
          y: Math.min(Math.max(0, round(l.y + move[e.key][1])), height - l.h),
        }),
      );
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onDelete(l.id);
    } else if (e.key === "Escape") onSelect(null);
  };

  const keys = React.useRef(onKeyDown);
  keys.current = onKeyDown;
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div
      ref={wrap}
      tabIndex={-1}
      className="w-full outline-none"
      aria-label="Tag canvas: click a part to select it, drag to move, arrow keys to nudge"
    >
      <div
        className="relative mx-auto touch-none select-none bg-white shadow-[0_1px_6px_rgba(0,0,0,.18)] [font-family:'Kinus_Sans','Noto_Sans','Noto_Sans_Hebrew',Arial,sans-serif]"
        style={{ width: width * scale, height: height * scale }}
        onPointerDown={() => onSelect(null)}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {background && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={background}
            alt=""
            className="pointer-events-none absolute inset-0 size-full object-cover"
          />
        )}
        {layers.map((l) => (
          <Part
            key={l.id}
            l={l}
            scale={scale}
            values={values}
            images={images}
            selected={l.id === selected}
            onStart={start}
            onFit={onFit}
          />
        ))}
        {(() => {
          const sel = layers.find((l) => l.id === selected);
          return sel ? (
            <Selection l={sel} scale={scale} onStart={start} />
          ) : null;
        })()}
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
        "absolute cursor-move",
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
        {l.type === "text" && (
          <TextPart l={l} scale={scale} values={values} onFit={onFit} />
        )}
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
            <QrPart text={fill(l.text, (k) => values[k] ?? "")} />
          ) : (
            <EmptyCode what="QR code" />
          ))}
        {l.type === "image" &&
          (images[l.path] ? (
            <div
              className="size-full bg-center bg-no-repeat"
              style={{
                backgroundImage: `url("${images[l.path]}")`,
                backgroundSize: l.fit === "cover" ? "cover" : "contain",
              }}
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-slate-100 text-[10px] text-slate-500">
              Picture
            </div>
          ))}
      </div>
    </div>
  );
}

/** The selected part's outline and resize handles, above everything (only the handles take clicks). */
function Selection({
  l,
  scale,
  onStart,
}: {
  l: Layer;
  scale: number;
  onStart: (e: React.PointerEvent, l: Layer, mode: "move" | Handle) => void;
}) {
  return (
    <div
      className="pointer-events-none absolute z-30 outline outline-2 outline-primary"
      style={{
        left: l.x * scale,
        top: l.y * scale,
        width: l.w * scale,
        height: l.h * scale,
      }}
    >
      {HANDLES.map((h) => (
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
          <CodeImage svg={code.svg} stretch />
        ) : (
          <div className="size-full bg-slate-200" />
        )}
      </div>
      {l.showText !== false && (
        <div
          className="text-center leading-[1.2]"
          style={{
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

function QrPart({ text }: { text: string }) {
  const code = useCode("qr", text);
  return code?.svg ? (
    <CodeImage svg={code.svg} />
  ) : (
    <div className="size-full bg-slate-200" />
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
  // cut off even at the smallest size: shown on the tag, not only in the side panel
  const [cut, setCut] = React.useState(false);
  const text = fill(l.text, (k) => values[k] ?? "");
  // like print: "T-shirt: {{TSHIRT}}" with no T-shirt prints nothing at all
  const fields = [...l.text.matchAll(/\{\{[^{}]+\}\}/g)];
  const skipped =
    fields.length > 0 &&
    fields.every((m) => fill(m[0], (k) => values[k] ?? "").trim() === "");
  const empty = text.trim() === "" || skipped;
  // 1 pt = 0.3528 mm; on the canvas, mm are `scale` px
  const target = l.size * MM_PER_PT * scale;
  const min = (l.minSize ?? DEFAULT_MIN_PT) * MM_PER_PT * scale;
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
        setCut(over);
        onFit(l.id, { pt: l.size, overflow: over });
        return;
      }
      const r = fitText(box.current, span.current, target, min);
      setCut(r.overflow);
      onFit(l.id, {
        pt: Math.round((r.px / (MM_PER_PT * scale)) * 2) / 2,
        overflow: r.overflow,
      });
    };
    run();
    // measure again once the print fonts have loaded
    document.fonts?.ready.then(run).catch(() => undefined);
  }, [
    text,
    target,
    min,
    l.fit,
    l.wrap,
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
      {cut && (
        <span className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_0_2px_#dc2626]">
          <span className="absolute right-0 top-0 rounded-bl bg-red-600 px-1 text-[9px] font-semibold leading-tight text-white">
            Cut off
          </span>
        </span>
      )}
      <div
        ref={box}
        className={cn(
          "flex size-full items-center overflow-hidden leading-[1.15]",
          l.wrap ? "items-start whitespace-normal" : "whitespace-nowrap",
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
          fontStyle: empty || l.italic ? "italic" : undefined,
          fontFamily: fontStack(l.font),
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
          className="max-w-full [unicode-bidi:plaintext]"
          style={{ textDecoration: l.underline ? "underline" : undefined }}
        >
          {empty ? l.text : text}
        </span>
      </div>
    </>
  );
}
