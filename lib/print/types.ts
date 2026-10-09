export type Transform =
  | { type: "value_map"; map_id: string; fallback?: "original" | "blank" }
  | { type: "replace"; pattern: string; replacement: string; flags?: string }
  | { type: "case"; mode: "upper" | "lower" | "title" };

export type MergeField = { key: string; label: string; source_field: string; transforms: Transform[] };
export type ValueMap = { id: string; name: string; source_field: string; entries: { source_value: string; output_value: string }[] };

export type Layer =
  | { id: string; type: "text"; text: string; x: number; y: number; w: number; h: number; size: number; weight?: 400 | 700; align?: "left" | "center" | "right"; color?: string; fit?: boolean; wrap?: boolean }
  | { id: string; type: "barcode"; text: string; x: number; y: number; w: number; h: number; showText?: boolean }
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
