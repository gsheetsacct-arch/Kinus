import { findNumber } from "@/lib/hebrew-number";

/**
 * Bunk numbers that run on from one camp to the next: the first camp (American) keeps its
 * own numbers (Bunk Samech Hei → 65); the next camp starts after the first camp's highest
 * bunk (French Bunk Alef → 66), and the one after that after the second camp's highest
 * (Hebrew Bunk Alef → 66 + French's highest). Camps come in their usual order.
 *
 * `camps`: each camp's bunks ({ id, name }), in camp order. Returns bunk id → number;
 * a bunk with no number in its name gets none.
 */
export function continuedBunkNumbers(camps: { id: string; name: string }[][]): Map<string, number> {
  const out = new Map<string, number>();
  let offset = 0;
  for (const bunks of camps) {
    let highest = 0;
    for (const b of bunks) {
      const n = findNumber(b.name)?.value;
      if (!n) continue;
      out.set(b.id, offset + n);
      highest = Math.max(highest, n);
    }
    offset += highest;
  }
  return out;
}
