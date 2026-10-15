/**
 * Staff corrections to export columns (campers.source_fixes, migration 0034): by column,
 * the corrected value and what the registration said when it was fixed. Imports never
 * overwrite them; everything that reads an export column reads through `withFixes`.
 */
export type SourceFix = { value: string; was?: string; by?: string; at?: string };
export type SourceFixes = Record<string, SourceFix>;

/** "family#City " and "family.city" are one column. */
export const fixKey = (k: string) => k.trim().toLowerCase().replace(/#/g, ".").replace(/\s+/g, " ");

export function parseFixes(raw: unknown): SourceFixes {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: SourceFixes = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === "object" && typeof (v as SourceFix).value === "string") out[fixKey(k)] = v as SourceFix;
  }
  return out;
}

/** The export row with the fixes in place of what the registration says. */
export function withFixes(sourceData: unknown, fixes: unknown): Record<string, unknown> {
  const data = sourceData && typeof sourceData === "object" && !Array.isArray(sourceData) ? (sourceData as Record<string, unknown>) : {};
  const f = parseFixes(fixes);
  if (!Object.keys(f).length) return data;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) out[k] = f[fixKey(k)] ? f[fixKey(k)].value : v;
  for (const [k, fix] of Object.entries(f)) if (!Object.keys(data).some((d) => fixKey(d) === k)) out[k] = fix.value;
  return out;
}
