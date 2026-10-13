import type { TemplateSpec } from "./types";

/**
 * Part-used label sheets (Avery 5160: 30 to a sheet…). Kinus remembers, per kind of label
 * sheet, the first free label on the sheet in the printer, so the next print starts there
 * instead of on a fresh sheet. Templates on the same stock share it: it's one physical sheet.
 */
export type SheetStock = { key: string; perSheet: number; cols: number; rows: number; labelW: number; labelH: number };

/** The label stock a template prints on; null for label printers (one tag per page). */
export function sheetStock(spec: Pick<TemplateSpec, "sheet_layout" | "page_width_mm" | "page_height_mm">): SheetStock | null {
  const s = spec.sheet_layout;
  if (!s || s.cols < 1 || s.rows < 1) return null;
  const per = s.cols * s.rows;
  if (per < 2) return null;
  const key = s.preset || `${s.paper}-${s.cols}x${s.rows}-${Math.round(spec.page_width_mm * 10)}x${Math.round(spec.page_height_mm * 10)}`;
  return { key, perSheet: per, cols: s.cols, rows: s.rows, labelW: spec.page_width_mm, labelH: spec.page_height_mm };
}

/** A label number (1-based) kept inside the sheet. */
export const clampPosition = (n: number, perSheet: number) => (Number.isFinite(n) && n >= 1 && n <= perSheet ? Math.floor(n) : 1);

/** The labels already used on the sheet in the printer (1-based), cleaned up: inside the sheet, sorted, never all of it. */
export function cleanUsed(used: Iterable<number>, perSheet: number): number[] {
  const out = [...new Set([...used].filter((n) => Number.isInteger(n) && n >= 1 && n <= perSheet))].sort((a, b) => a - b);
  return out.length >= perSheet ? [] : out;
}

/** "Labels 1–6 used" as a list. */
export const usedBefore = (start: number, perSheet: number) => Array.from({ length: clampPosition(start, perSheet) - 1 }, (_, i) => i + 1);

/** The free labels on the sheet in the printer, in printing order. */
export const freeLabels = (used: number[], perSheet: number) => Array.from({ length: perSheet }, (_, i) => i + 1).filter((n) => !used.includes(n));

/** How many sheets a print of `tags` labels uses, starting on a sheet with `used` labels gone. */
export function sheetsUsed(used: number[], tags: number, perSheet: number): number {
  const free = freeLabels(cleanUsed(used, perSheet), perSheet).length;
  return tags <= free ? (tags > 0 ? 1 : 0) : 1 + Math.ceil((tags - free) / perSheet);
}

/** The sheet in the printer after printing `tags` labels: which labels are used then ([] = a fresh sheet). */
export function usedAfter(used: number[], tags: number, perSheet: number): number[] {
  const clean = cleanUsed(used, perSheet);
  const free = freeLabels(clean, perSheet);
  if (tags < free.length) return cleanUsed([...clean, ...free.slice(0, tags)], perSheet);
  const left = (tags - free.length) % perSheet;
  // the sheet ended full: the next print starts on a fresh one; else part of the last sheet is used
  return usedBefore(left + 1, perSheet);
}

/** The first free label after printing `tags` labels from `start` (1: a fresh sheet). */
export function nextPosition(start: number, tags: number, perSheet: number): number {
  return freeLabels(usedAfter(usedBefore(start, perSheet), tags, perSheet), perSheet)[0] ?? 1;
}
