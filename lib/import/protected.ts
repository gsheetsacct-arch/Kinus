/**
 * Protected columns (Settings → Protected columns): details the office cleans by hand in a
 * copy of the export (medical notes kept for division heads, a counselor-safe version) and
 * uploads as "our corrected copy". Only what that copy actually changed is locked, camper by
 * camper: a value removed or changed there (and a column added there) stays as the office
 * left it, whatever later exports say. Anything the office left alone keeps updating from the
 * export, also information that arrives later where there was none.
 *   * camper details (medical notes…): locked like a change made in Kinus (staff_edited);
 *   * export columns: locked as a fix (campers.source_fixes), like a Hebrew-name fix.
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

/** What a corrected copy locks for one camper: their protected details it changed, and export columns it changed. */
export type Locks = { fields: string[]; columns: { column: string; value: string; was: string }[] };

/**
 * The locks for one camper in a corrected copy: the protected camper details among its changes,
 * and each protected export column whose value differs from what Kinus shows now (`shown`:
 * the export row with earlier fixes; `registration`: the export row as it came in).
 */
export function locksFor(
  changes: { field: string }[],
  file: Record<string, string>,
  shown: Record<string, unknown>,
  registration: Record<string, unknown>,
  p: Protected,
): Locks {
  const fields = changes.map((c) => c.field).filter((f) => p.fields.includes(f));
  const valueOf = (row: Record<string, unknown>, column: string) => {
    const k = columnKey(column);
    for (const [key, v] of Object.entries(row)) if (columnKey(key) === k) return v === null || v === undefined ? "" : String(v).trim();
    return "";
  };
  const columns: Locks["columns"] = [];
  for (const column of p.columns) {
    const value = valueOf(file, column);
    if (value !== valueOf(shown, column)) columns.push({ column, value, was: valueOf(registration, column) });
  }
  return { fields: [...new Set(fields)], columns };
}
