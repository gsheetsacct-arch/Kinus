export type Transform =
  | { type: "value_map"; map_id: string; fallback?: "original" | "blank" }
  | { type: "replace"; pattern: string; replacement: string; flags?: string }
  | { type: "case"; mode: "upper" | "lower" | "title" }
  /** "Bunk Yud Alef" / "יא" / "11" → a number, Hebrew letters (יא) or Hebrew with marks (י״א); keep_words keeps "Bunk". */
  | { type: "hebrew_number"; to: "number" | "hebrew" | "hebrew_marks"; keep_words?: boolean };

/** enabled: on the merge list (offered in the editor, in the data for Publisher). Off-list fields still print where used. */
export type MergeField = { key: string; label: string; source_field: string; transforms: Transform[]; enabled?: boolean };
export type ValueMap = { id: string; name: string; source_field: string; entries: { source_value: string; output_value: string }[] };

/** Quarter turns: 90 reads top to bottom, -90 bottom to top. The box (x, y, w, h) is what you see on the tag. */
export type Rotation = 0 | 90 | -90;

/** On every part: locked parts can't be moved or resized on the canvas; hidden ones don't show or print; "back": on the back of a two-sided tag. */
export type PartFlags = { locked?: boolean; hidden?: boolean; side?: "back" };

/**
 * A two-sided tag: parts marked side "back" print on the back, exactly behind the front.
 * The printer turns the paper over on its long edge (the usual two-sided setting) or its
 * short edge; on label sheets the back page is laid out mirrored to match. A duplex printer
 * often lands the back a little off: shift moves the back side only (+ right / down, as seen
 * from the back).
 */
export type BackSide = { flip: "long" | "short"; shiftXMm?: number; shiftYMm?: number };

export const onBack = (l: { side?: "back" }) => l.side === "back";

/**
 * Text "size" is a target: short text prints at that size, longer text shrinks to stay
 * inside its box (never below minSize, default 6 pt). Give long fields a wider box.
 */
export type Layer = PartFlags &
  (
  | {
      id: string;
      type: "text";
      text: string;
      x: number;
      y: number;
      w: number;
      h: number;
      size: number;
      weight?: 400 | 700;
      align?: "left" | "center" | "right";
      color?: string;
      fit?: boolean;
      wrap?: boolean;
      rotate?: Rotation;
      minSize?: number;
      /** lib/print/font-families: sans (default), rounded, serif, display */
      font?: "sans" | "rounded" | "serif" | "display" | `custom:${string}`;
      italic?: boolean;
      underline?: boolean;
    }
  /** color: the bars or squares (and the barcode's number), dark enough to scan; default black. */
  | { id: string; type: "barcode"; text: string; x: number; y: number; w: number; h: number; showText?: boolean; rotate?: Rotation; color?: string }
  | { id: string; type: "qr"; text: string; x: number; y: number; w: number; h: number; color?: string }
  | { id: string; type: "box"; x: number; y: number; w: number; h: number; fill?: string; radius?: number; border?: string }
  /**
   * A picture (a camp logo…), stored with the templates; "contain" shows all of it, "cover" fills the box.
   * `byDivision`: another picture for campers of a division (by the division's name, so it carries
   * over to next session's divisions); "" = no picture for that division. Others get `path`.
   */
  | { id: string; type: "image"; path: string; x: number; y: number; w: number; h: number; fit?: "contain" | "cover"; byDivision?: Record<string, string> }
  );

/**
 * Tags laid out on Letter/A4 sheets. Label sheets (Avery…) give the first label's top-left
 * corner and the pitch (start of one label to the start of the next). Older templates
 * only have a margin and a gap, centred across the page.
 */
export type SheetLayout = {
  paper: "letter" | "a4";
  cols: number;
  rows: number;
  leftMm?: number;
  topMm?: number;
  pitchXMm?: number;
  pitchYMm?: number;
  marginMm?: number;
  gapMm?: number;
  /** The label stock it was set up for (lib/print/presets). */
  preset?: string;
  /** Moves everything to make up for a printer that prints a little off (+ is right / down). */
  shiftXMm?: number;
  shiftYMm?: number;
};

/** Where each label sits on the page. */
export function sheetPlacement(s: SheetLayout, tagW: number, tagH: number, paperW: number) {
  if (s.leftMm !== undefined && s.topMm !== undefined) {
    return { left: s.leftMm, top: s.topMm, pitchX: s.pitchXMm ?? tagW, pitchY: s.pitchYMm ?? tagH };
  }
  const gap = s.gapMm ?? 0;
  return { left: (paperW - (s.cols * tagW + (s.cols - 1) * gap)) / 2, top: s.marginMm ?? 0, pitchX: tagW + gap, pitchY: tagH + gap };
}

export type TemplateSpec = {
  id?: string;
  name: string;
  kind: string;
  page_width_mm: number;
  page_height_mm: number;
  layers: Layer[];
  sheet_layout: SheetLayout | null;
  background_path?: string | null;
  /** Set: printed on both sides (migration 0035). */
  back?: BackSide | null;
};

export type PrintItem = { values: Record<string, string>; copies: number };

/** The merge values carry the camper's division name under this key (for per-division pictures). */
export const DIVISION_VALUE = "__division";

const sameDivision = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The picture a picture part shows for a camper of this division ("" = none). */
export function pictureFor(l: { path: string; byDivision?: Record<string, string> }, division: string | null | undefined): string {
  if (division && l.byDivision) for (const [name, path] of Object.entries(l.byDivision)) if (sameDivision(name, division)) return path;
  return l.path;
}

/** Every stored picture a part can show (its own and each division's). */
export const picturesOf = (l: { path?: string; byDivision?: Record<string, string> }): string[] => [l.path ?? "", ...Object.values(l.byDivision ?? {})].filter(Boolean);
