import { getFieldValue, type CamperLike } from "@/lib/fields";
import type { MergeField, Transform, ValueMap } from "./types";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Every camper value a merge field can start from, as plain strings. */
export function sourceValues(c: CamperLike & { division_color?: string | null }): (key: string) => string {
  return (key) => {
    if (key === "division_color") return c.division_color ?? "#64748b";
    const v = getFieldValue(c, key);
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return v;
  };
}

/** "{{a}} {{b}}" over a lookup function; unknown keys become empty. */
export function fill(template: string, get: (key: string) => string): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => get(k) ?? "");
}

export function applyTransforms(value: string, transforms: Transform[], maps: Map<string, ValueMap>): string {
  let v = value;
  for (const t of transforms) {
    if (t.type === "value_map") {
      const m = maps.get(t.map_id);
      const hit = m?.entries.find((e) => norm(e.source_value) === norm(v));
      if (hit) v = hit.output_value;
      else if (t.fallback === "blank") v = "";
    } else if (t.type === "replace") {
      try {
        v = v.replace(new RegExp(t.pattern, t.flags ?? ""), t.replacement);
      } catch {
        // an invalid pattern leaves the value as it is
      }
    } else if (t.type === "case") {
      v = t.mode === "upper" ? v.toUpperCase() : t.mode === "lower" ? v.toLowerCase() : v.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
    }
  }
  return v.trim();
}

/** Merge values for one camper: { FIRST: "Léa", TSHIRT: "YS", ... }. */
export function mergeValues(c: CamperLike & { division_color?: string | null }, fields: MergeField[], maps: Map<string, ValueMap>): Record<string, string> {
  const get = sourceValues(c);
  const out: Record<string, string> = {};
  for (const f of fields) {
    const raw = f.source_field.includes("{{") ? fill(f.source_field, get) : get(f.source_field);
    out[f.key] = applyTransforms(raw, f.transforms ?? [], maps);
  }
  return out;
}

/** Values used for previews when no camper is chosen. */
export const SAMPLE_VALUES: Record<string, string> = {
  FIRST: "מנחם מענדל",
  LAST: "Gérard-Lévy",
  FULL: "מנחם מענדל Gérard-Lévy",
  CODE: "100016",
  BARCODE: "KN100016",
  DIVISION: "Division 2",
  DIV: "2",
  DIVISION_COLOR: "#2563eb",
  BUNK: "Bunk Chof Beis",
  BUNK_SHORT: "Chof Beis",
  GRADE: "5",
  TSHIRT: "YS",
  ADDRESS: "1234 Crown St",
  CROSS_STREETS: "Kingston & Albany",
  MOTHER_PHONE: "+1 718 555 0100",
  FATHER_PHONE: "+1 917 555 0199",
};
