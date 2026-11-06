import { isHebrewQuery, matchScore, searchEntry, type SearchEntry } from "@/lib/search";
import type { CamperStatus } from "@/lib/attendance/machine";

/** A camper as Final check-out's Find tab knows them. */
export type FindCamper = { id: string; code: string; name: string; last: string; heb?: string; buzzer?: number | null; family: string | null; status: CamperStatus };

/** Here (can go home), already gone home, or never checked in (nothing to check out). */
export type Standing = "here" | "gone" | "never";
export const standingOf = (s: CamperStatus): Standing => (s === "departed" ? "gone" : s === "expected" || s === "no_show" ? "never" : "here");
const RANK: Record<Standing, number> = { here: 0, gone: 1, never: 2 };

export type FamilyGroup<C extends FindCamper> = { key: string; members: C[]; /** Some of them are here to go home. */ anyHere: boolean };

/** What each camper can be found by: English and Hebrew name, code, buzzer number. */
export function findIndex<C extends FindCamper>(roster: C[]): { c: C; e: SearchEntry }[] {
  return roster.map((c) => ({ c, e: searchEntry(c.heb ? `${c.name} ${c.heb}` : c.name, c.code, [], c.buzzer ?? null) }));
}

/**
 * The campers matching what was typed (smart: any order, sounds-like, typos; a code or buzzer
 * number), each with their whole family (the export's family id), so a parent's children are
 * called together. Families with someone here come first, then those already gone home, and
 * those who never checked in last; in a family the same order, then by name. Typed in Hebrew,
 * families with a Hebrew name (the Hebrew and French divisions) come before the rest.
 */
export function findFamilies<C extends FindCamper>(index: { c: C; e: SearchEntry }[], q: string, limit = 40): FamilyGroup<C>[] {
  if (!q.trim()) return [];
  const byFamily = new Map<string, C[]>();
  for (const { c } of index) if (c.family) byFamily.set(c.family, [...(byFamily.get(c.family) ?? []), c]);
  const groups = new Map<string, { members: C[]; score: number }>();
  for (const { c, e } of index) {
    const score = matchScore(e, q);
    if (score <= 0) continue;
    const key = c.family ? `f:${c.family}` : `c:${c.id}`;
    const g = groups.get(key);
    if (g) g.score = Math.max(g.score, score);
    else groups.set(key, { members: c.family ? (byFamily.get(c.family) ?? [c]) : [c], score });
  }
  const best = (m: C[]) => Math.min(...m.map((c) => RANK[standingOf(c.status)]));
  // typed in Hebrew: families with a Hebrew name (the Hebrew and French divisions) first; English finds everyone alike
  const hebrew = isHebrewQuery(q);
  const heb = (m: C[]) => (hebrew && m.some((c) => c.heb) ? 0 : 1);
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      score: g.score,
      members: [...g.members].sort((a, b) => RANK[standingOf(a.status)] - RANK[standingOf(b.status)] || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => best(a.members) - best(b.members) || heb(a.members) - heb(b.members) || b.score - a.score || a.members[0].last.localeCompare(b.members[0].last))
    .slice(0, limit)
    .map(({ key, members }) => ({ key, members, anyHere: members.some((c) => standingOf(c.status) === "here") }));
}
