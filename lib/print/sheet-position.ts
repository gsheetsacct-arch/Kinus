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

/** Where the next print starts after printing `tags` labels from `start`: 1 again when the last sheet ended full. */
export function nextPosition(start: number, tags: number, perSheet: number): number {
  return ((clampPosition(start, perSheet) - 1 + Math.max(0, tags)) % perSheet) + 1;
}

/** How many sheets a print uses, starting at `start`. */
export function sheetsUsed(start: number, tags: number, perSheet: number): number {
  return Math.ceil((clampPosition(start, perSheet) - 1 + Math.max(0, tags)) / perSheet);
}
