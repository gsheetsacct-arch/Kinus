"use client";
import { fill } from "@/lib/print/merge";
import { fitText } from "@/lib/print/fit";
import { CURVE_SCALE, DEFAULT_ARC, fitCurve } from "@/lib/print/curve";
import { FLOOR_PT, minPt } from "@/lib/print/render-constants";
import { textAlignItems, textSpacingCss, type Layer } from "@/lib/print/types";
import { fontStack, lineHeightOf } from "@/lib/print/font-families";

export type FitPerson = { name: string; code: string; values: Record<string, string> };
export type FitResult = {
  /** Campers measured (those with something to print in this part). */
  checked: number;
  /** The camper whose text prints smallest, and at what size. */
  smallest: { name: string; code: string; pt: number } | null;
  /** Campers whose text only fits under the part's smallest size: it prints that much smaller, whole. */
  small: { name: string; code: string; pt: number }[];
  /** Campers whose text doesn't fit even at the floor (FLOOR_PT): cut off. */
  cut: { name: string; code: string }[];
  /** The smallest size anyone needs to fit (the smallest of `small`), or null if nobody goes under. */
  needPt: number | null;
};

type TextLayer = Extract<Layer, { type: "text" }>;
const MM_PER_PT = 25.4 / 72;
const S = 4; // px per mm while measuring

/**
 * How a text part prints for every camper: measured off-screen in the same styles as the
 * canvas (and the printed page), with the same shrink-to-fit steps. Nothing is guessed from
 * the number of letters.
 */
export function checkFit(l: TextLayer, people: FitPerson[]): FitResult {
  if (l.curve) return checkCurve(l, people);
  const turned = Boolean(l.rotate);
  const w = (turned ? l.h : l.w) * S;
  const h = (turned ? l.w : l.h) * S;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none";
  const box = document.createElement("div");
  box.style.cssText = `display:flex;align-items:${textAlignItems(l)};overflow:hidden;line-height:${l.lineHeight ?? lineHeightOf(l.font)};width:${w}px;height:${h}px;white-space:${l.wrap ? "normal" : "nowrap"};font-weight:${l.weight ?? 400};font-style:${l.italic ? "italic" : "normal"};font-family:${fontStack(l.font)};text-align:${l.align ?? "left"};${textSpacingCss(l)}`;
  const span = document.createElement("span");
  span.dir = "auto";
  span.style.cssText = `max-width:100%;overflow:hidden;unicode-bidi:plaintext;${l.wrap ? "text-wrap:balance;" : ""}text-decoration:${l.underline ? "underline" : "none"}`;
  box.appendChild(span);
  host.appendChild(box);
  document.body.appendChild(host);
  const target = l.size * MM_PER_PT * S;
  const min = minPt(l) * MM_PER_PT * S;
  const floor = Math.min(FLOOR_PT, minPt(l)) * MM_PER_PT * S;
  const fields = [...l.text.matchAll(/\{\{[^{}]+\}\}/g)];
  const out: FitResult = { checked: 0, smallest: null, small: [], cut: [], needPt: null };
  try {
    for (const p of people) {
      const get = (k: string) => p.values[k] ?? "";
      // a part whose fields are all empty prints nothing for this camper
      if (fields.length && fields.every((m) => fill(m[0], get).trim() === "")) continue;
      const text = fill(l.text, get);
      if (!text.trim()) continue;
      span.textContent = text;
      out.checked++;
      if (l.fit === false) {
        box.style.fontSize = `${target}px`;
        const over = span.scrollWidth > box.clientWidth + 0.5 || box.scrollHeight > box.clientHeight + 0.5;
        if (over) out.cut.push({ name: p.name, code: p.code });
        continue;
      }
      const r = fitText(box, span, target, min, floor);
      const pt = Math.round((r.px / (MM_PER_PT * S)) * 2) / 2;
      if (r.overflow) {
        out.cut.push({ name: p.name, code: p.code });
        continue;
      }
      if (r.below) out.small.push({ name: p.name, code: p.code, pt });
      if (!out.smallest || pt < out.smallest.pt) out.smallest = { name: p.name, code: p.code, pt };
    }
  } finally {
    host.remove();
  }
  out.small.sort((a, b) => a.pt - b.pt);
  if (out.small.length) out.needPt = out.small[0].pt;
  return out;
}

/** checkFit for text along a circle: the same SVG and steps as the canvas and the printed page. */
function checkCurve(l: TextLayer, people: FitPerson[]): FitResult {
  const NS = "http://www.w3.org/2000/svg";
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none;width:${l.w * S}px;height:${l.h * S}px`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${l.w * CURVE_SCALE} ${l.h * CURVE_SCALE}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  const path = document.createElementNS(NS, "path");
  path.id = `kcfit${Math.random().toString(36).slice(2)}`;
  const text = document.createElementNS(NS, "text");
  text.setAttribute("font-weight", String(l.weight ?? 400));
  text.setAttribute("font-family", fontStack(l.font));
  if (l.italic) text.setAttribute("font-style", "italic");
  if (textSpacingCss(l)) text.setAttribute("style", textSpacingCss(l));
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  const tp = document.createElementNS(NS, "textPath");
  tp.setAttribute("href", `#${path.id}`);
  tp.setAttribute("startOffset", "50%");
  text.appendChild(tp);
  svg.append(path, text);
  host.appendChild(svg);
  document.body.appendChild(host);
  const fields = [...l.text.matchAll(/\{\{[^{}]+\}\}/g)];
  const out: FitResult = { checked: 0, smallest: null, small: [], cut: [], needPt: null };
  try {
    for (const p of people) {
      const get = (k: string) => p.values[k] ?? "";
      if (fields.length && fields.every((m) => fill(m[0], get).trim() === "")) continue;
      const value = fill(l.text, get);
      if (!value.trim()) continue;
      tp.textContent = value;
      out.checked++;
      const r = fitCurve(text, path, {
        w: l.w,
        h: l.h,
        side: l.curve!,
        arc: l.arc ?? DEFAULT_ARC,
        sizeMm: l.size * MM_PER_PT,
        minMm: minPt(l) * MM_PER_PT,
        floorMm: Math.min(FLOOR_PT, minPt(l)) * MM_PER_PT,
        fit: l.fit !== false,
      });
      const pt = Math.round((r.sizeMm / MM_PER_PT) * 2) / 2;
      if (r.overflow) {
        out.cut.push({ name: p.name, code: p.code });
        continue;
      }
      if (r.below) out.small.push({ name: p.name, code: p.code, pt });
      if (!out.smallest || pt < out.smallest.pt) out.smallest = { name: p.name, code: p.code, pt };
    }
  } finally {
    host.remove();
  }
  out.small.sort((a, b) => a.pt - b.pt);
  if (out.small.length) out.needPt = out.small[0].pt;
  return out;
}

/** The biggest text size (pt) one line can have in a box this tall, with every letter whole. */
export function boxCapPt(l: TextLayer): number {
  const tall = l.rotate ? l.w : l.h;
  return Math.max(3, Math.floor(tall / lineHeightOf(l.font) / MM_PER_PT));
}
