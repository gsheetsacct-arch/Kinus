/**
 * Protected columns (Settings → Protected columns): details the office cleaned by hand, like
 * medical notes kept for division heads and a counselor-safe version. A regular upload of the
 * registration export never changes them for campers already in Kinus (nor drops a column
 * the export doesn't have); only an upload marked "our corrected copy" does.
 */
import { columnKey } from "./extra-fields";

/** The camper fields that can be protected (the export's medical, address and notes details). */
export const PROTECTABLE_FIELDS: { field: string; label: string }[] = [
  { field: "medical_notes", label: "Medical notes" },
  { field: "allergies", label: "Allergy details" },
  { field: "has_allergies", label: "Has allergies" },
  { field: "has_epipen", label: "EpiPen" },
  { field: "has_medications", label: "Medications" },
  { field: "notes_from_parents", label: "Notes from parents" },
  { field: "local_address", label: "Local address" },
  { field: "local_address_cross_streets", label: "Cross streets" },
];

export type Protected = { fields: string[]; columns: string[] };

export function parseProtected(v: unknown): Protected {
  const o = (v && typeof v === "object" ? v : {}) as { fields?: unknown; columns?: unknown };
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim()) : []);
  const known = new Set(PROTECTABLE_FIELDS.map((f) => f.field));
  return { fields: list(o.fields).filter((f) => known.has(f)), columns: [...new Set(list(o.columns))] };
}

/**
 * A regular upload: each matched camper keeps their protected export columns as they are in
 * Kinus (also a column the export doesn't have, like one added in the corrected copy).
 */
export function keepProtectedColumns(
  rows: { matchedCamperId: string | null; action: string; parsed: { source_data: Record<string, string> } }[],
  before: Map<string, Record<string, string>>,
  columns: string[],
): number {
  if (!columns.length) return 0;
  const keys = new Set(columns.map(columnKey));
  let kept = 0;
  for (const r of rows) {
    if (!r.matchedCamperId || r.action === "add" || r.action === "skip") continue;
    const old = before.get(r.matchedCamperId) ?? {};
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.parsed.source_data ?? {})) if (!keys.has(columnKey(k))) next[k] = v;
    for (const [k, v] of Object.entries(old)) if (keys.has(columnKey(k))) next[k] = v;
    if (JSON.stringify(next) !== JSON.stringify(r.parsed.source_data ?? {})) kept++;
    r.parsed.source_data = next;
  }
  return kept;
}

/** A new camper whose protected details came straight from the export: worth a look. */
export function protectedFromFile(parsed: Record<string, unknown> & { source_data?: Record<string, string> }, p: Protected): string[] {
  const keys = new Set(p.columns.map(columnKey));
  const fields = p.fields.filter((f) => parsed[f] !== null && parsed[f] !== undefined && parsed[f] !== "").map((f) => PROTECTABLE_FIELDS.find((x) => x.field === f)?.label ?? f);
  const columns = Object.entries(parsed.source_data ?? {})
    .filter(([k, v]) => keys.has(columnKey(k)) && String(v).trim() !== "")
    .map(([k]) => k);
  return [...fields, ...columns];
}
