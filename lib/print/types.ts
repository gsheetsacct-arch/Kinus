export type Transform =
  | { type: "value_map"; map_id: string; fallback?: "original" | "blank" }
  | { type: "replace"; pattern: string; replacement: string; flags?: string }
  | { type: "case"; mode: "upper" | "lower" | "title" };

/** enabled: on the merge list (offered in the editor, in the data for Publisher). Off-list fields still print where used. */
export type MergeField = { key: string; label: string; source_field: string; transforms: Transform[]; enabled?: boolean };
export type ValueMap = { id: string; name: string; source_field: string; entries: { source_value: string; output_value: string }[] };

/** Quarter turns: 90 reads top to bottom, -90 bottom to top. The box (x, y, w, h) is what you see on the tag. */
export type Rotation = 0 | 90 | -90;

/**
 * Text "size" is a target: short text prints at that size, longer text shrinks to stay
 * inside its box (never below minSize, default 6 pt). Give long fields a wider box.
 */
export type Layer =
  | { id: string; type: "text"; text: string; x: number; y: number; w: number; h: number; size: number; weight?: 400 | 700; align?: "left" | "center" | "right"; color?: string; fit?: boolean; wrap?: boolean; rotate?: Rotation; minSize?: number }
  | { id: string; type: "barcode"; text: string; x: number; y: number; w: number; h: number; showText?: boolean; rotate?: Rotation }
  | { id: string; type: "qr"; text: string; x: number; y: number; w: number; h: number }
  | { id: string; type: "box"; x: number; y: number; w: number; h: number; fill?: string; radius?: number; border?: string };

export type SheetLayout = { paper: "letter" | "a4"; cols: number; rows: number; marginMm: number; gapMm: number };

export type TemplateSpec = {
  id?: string;
  name: string;
  kind: string;
  page_width_mm: number;
  page_height_mm: number;
  layers: Layer[];
  sheet_layout: SheetLayout | null;
  background_path?: string | null;
};

export type PrintItem = { values: Record<string, string>; copies: number };
