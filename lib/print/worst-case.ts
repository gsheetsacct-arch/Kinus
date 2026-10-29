import { fill } from "./merge";
import { widthEstimate } from "./width-estimate";

export type PartText = { text: string; w: number };

/** The fields a part's text uses ("{{HEB_FIRST|FIRST}} {{LAST}}" → HEB_FIRST, FIRST, LAST). */
const fieldsOf = (text: string) => [...text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].flatMap((m) => m[1].split("|").map((k) => k.trim()));

/**
 * The worst case for a design: every field at its widest, but fields that print together in one
 * part ({{FIRST}} {{LAST}}) always come from one real person: the one whose text is widest for
 * that part's box. Otherwise the longest first name and the longest last name of two different
 * campers would show as one made-up name. Fields on no part (or with no parts given) keep the
 * widest value of anyone (`widest`).
 */
export function worstValues(people: Record<string, string>[], parts: PartText[], widest: Record<string, string>): Record<string, string> {
  const values = { ...widest };
  const texts = parts.filter((t) => t.text.includes("{{") && t.w > 0);
  if (!people.length || !texts.length) return values;
  // parts that share a field are one group: the same person fills all of them
  const parent = texts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstWith = new Map<string, number>();
  texts.forEach((t, i) => {
    for (const k of fieldsOf(t.text)) {
      const j = firstWith.get(k);
      if (j === undefined) firstWith.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, PartText[]>();
  texts.forEach((t, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), t]));
  for (const group of groups.values()) {
    const score = (p: Record<string, string>) => Math.max(...group.map((t) => widthEstimate(fill(t.text, (k) => p[k] ?? "")) / t.w));
    const best = people.reduce((a, b) => (score(b) > score(a) ? b : a));
    for (const t of group) for (const k of fieldsOf(t.text)) values[k] = best[k] ?? "";
  }
  return values;
}
