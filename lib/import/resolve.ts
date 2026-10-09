import type { ParsedCamper } from "./mapping";

export type KnownDivision = { name: string; bunks: string[] };

/**
 * Some campers are listed in several divisions or bunks at once ("Division 3,Bar Mitzvah
 * Program" / "Bunk Nun Vov"). Kinus keeps one division and one bunk per camper, so pick
 * the pair the rest of the data supports: a bunk that already belongs to one of the
 * listed divisions (in the database, or on rows of this file that list a single
 * division). Falls back to the first listed values. Every such row gets a warning.
 */
export function resolveMultiValues<T extends { parsed: ParsedCamper }>(rows: T[], known: KnownDivision[]): T[] {
  const bunkHome = new Map<string, Set<string>>();
  const add = (bunk: string, division: string) => {
    if (!bunkHome.has(bunk)) bunkHome.set(bunk, new Set());
    bunkHome.get(bunk)!.add(division);
  };
  for (const d of known) for (const b of d.bunks) if (!b.includes(",") && !d.name.includes(",")) add(b, d.name);
  for (const { parsed: p } of rows) {
    if (p.division_candidates.length === 1 && p.bunk_candidates.length === 1) add(p.bunk_candidates[0], p.division_candidates[0]);
  }

  for (const r of rows) {
    const p = r.parsed;
    const divs = p.division_candidates;
    const bunks = p.bunk_candidates;
    if (divs.length <= 1 && bunks.length <= 1) continue;

    let division = divs[0] ?? null;
    let bunk = bunks[0] ?? null;
    let reason = "the first one listed";
    outer: for (const b of bunks) {
      for (const d of divs.length ? divs : [division].filter((x): x is string => x !== null)) {
        if (bunkHome.get(b)?.has(d)) {
          division = d;
          bunk = b;
          reason = `${b} belongs to ${d}`;
          break outer;
        }
      }
    }
    p.division_name = division;
    p.bunk_name = bunk;
    const listed = [divs.length > 1 ? `divisions ${divs.join(" and ")}` : null, bunks.length > 1 ? `bunks ${bunks.join(" and ")}` : null]
      .filter(Boolean)
      .join(", ");
    p.warnings.push(`The export lists ${listed}. Placed in ${[division, bunk].filter(Boolean).join(" / ")} (${reason}). Move the camper on their page if that is wrong.`);
  }
  return rows;
}
