import { withFixes } from "@/lib/source-fixes";

/**
 * The export's own columns (everything not read into a Kinus field) that differ for each
 * matched camper, as changes "source.<column>": old → new. A column fixed in Kinus (a Hebrew
 * name fixed on Print → Hebrew names, an Edit-tab correction) keeps its fix, so it isn't a
 * change. Rows with such changes become updates. Returns how many campers got some.
 */
export function exportColumnChanges(
  rows: { matchedCamperId: string | null; action: string; changes: { field: string; old: string | null; new: string | null }[]; parsed: { source_data?: Record<string, string> } }[],
  before: Map<string, Record<string, string>>,
  fixes: Map<string, unknown>,
  mapped: string[],
): number {
  const key = (k: string) => k.trim().toLowerCase().replace(/#/g, ".").replace(/\s+/g, " ");
  const skip = new Set(mapped.map(key));
  const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
  let campers = 0;
  for (const r of rows) {
    if (!r.matchedCamperId || (r.action !== "update" && r.action !== "unchanged")) continue;
    const fix = fixes.get(r.matchedCamperId);
    const old = withFixes(before.get(r.matchedCamperId) ?? {}, fix);
    const next = withFixes(r.parsed.source_data ?? {}, fix);
    const oldBy = new Map(Object.entries(old).map(([k, v]) => [key(k), text(v)]));
    const seen = new Set<string>();
    const found: { field: string; old: string | null; new: string | null }[] = [];
    for (const [k, v] of Object.entries(next)) {
      const kk = key(k);
      // a repeated column ("family.city (2)") is the same column again
      if (skip.has(kk) || seen.has(kk) || / \(\d+\)$/.test(kk)) continue;
      seen.add(kk);
      const was = oldBy.get(kk) ?? "";
      const now = text(v);
      if (was !== now) found.push({ field: `source.${k.trim()}`, old: was || null, new: now || null });
    }
    if (!found.length) continue;
    r.changes = [...r.changes.filter((c) => !c.field.startsWith("source.")), ...found];
    r.action = "update";
    campers++;
  }
  return campers;
}
