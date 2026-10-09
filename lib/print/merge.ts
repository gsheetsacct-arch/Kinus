import { getFieldValue, type CamperLike } from "@/lib/fields";
import type { MergeField, Transform, ValueMap } from "./types";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** "ppa#Hebrew_Name" and "ppa.hebrew_name" are the same column (Publisher shows "." as "#"). */
const columnKey = (k: string) => k.trim().toLowerCase().replace(/#/g, ".");

/**
 * Every camper value a merge field can start from, as plain strings. Besides the fields
 * Kinus keeps, any column of the registration export works as "source.<column header>"
 * (e.g. source.ppa.hebrew_name), read from the camper's row in the latest import.
 */
export function sourceValues(c: CamperLike & { division_color?: string | null; source_data?: unknown }): (key: string) => string {
  let columns: Map<string, string> | null = null;
  return (key) => {
    if (key.startsWith("source.")) {
      columns ??= new Map(Object.entries((c.source_data ?? {}) as Record<string, unknown>).map(([k, v]) => [columnKey(k), v === null || v === undefined ? "" : String(v).trim()]));
      return columns.get(columnKey(key.slice(7))) ?? "";
    }
    if (key === "division_color") return c.division_color ?? "#64748b";
    const v = getFieldValue(c, key);
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return v;
  };
}

/**
 * "{{a}} {{b}}" over a lookup function; unknown keys become empty. "{{a|b}}" is the first
 * of a, b that isn't empty (e.g. the Hebrew bunk name, else the bunk).
 */
export function fill(template: string, get: (key: string) => string): string {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, k: string) => {
    for (const alt of k.split("|")) {
      const v = get(alt.trim()) ?? "";
      if (v !== "") return v;
    }
    return "";
  });
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

/**
 * A made-up camper for previews when no real one is chosen: Hebrew and French names,
 * and the export columns the labels use, so every field shows something.
 */
export const SAMPLE_CAMPER = {
  first_name: "Gérard",
  last_name: "Lévy-Schneerson",
  camper_code: "100016",
  grade: "5",
  tshirt_size: "Youth Small",
  division_name: "Division 2",
  division_color: "#2563eb",
  bunk_name: "Bunk Chof Beis",
  local_address: "1234 Crown St",
  local_address_cross_streets: "Kingston & Albany",
  contacts: [
    { role: "mother", slot: 1, name: "Sarah", phone: "+1 718 555 0100", phone_e164: "+17185550100", email: null },
    { role: "father", slot: 1, name: "Yosef", phone: "+1 917 555 0199", phone_e164: "+19175550199", email: null },
  ],
  source_data: {
    "ppa.hebrew_name": "מנחם מענדל",
    "ppa.hebrew_last_name": "שניאורסאהן",
    "ppa.yarmulka_size": "Medium",
    "ppa.city": "Paris",
    "ppa.state": "",
    "ppa.country": "France",
  },
};

/** Values used for previews when no camper is chosen (built-in fields only; see SAMPLE_CAMPER). */
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
