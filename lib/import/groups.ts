import { cleanBunkName, splitList } from "./mapping";

/**
 * The registration system's one list of groups for a camper ("students.group"): its division,
 * bunk and Thursday Program, in any order, among other groups that aren't places (the price
 * paid, "Late Fee", "BM Document"):
 *
 *   "Division 3,Thursday Program - English,Kinus Main Program - Shluchim subsidized price,Bunk נו - Online School Only"
 *
 * When the export has it, it is the source of truth for division, bunk and Thursday Program.
 */
export const GROUPS_COLUMN = "students.group";

export type Groups = { divisions: string[]; bunks: string[]; thursday: string | null };

const THURSDAY = /^thursday program\b/i;
const BUNK = /^bunk\s/i;
// a division: "Division 2", "French Division", "Hebrew Division", "Bar Mitzvah Program"
// (not the program's price: "Kinus Main Program - Shluchim subsidized price")
const DIVISION = /^division\s+\S+$|\bdivision$|\bprogram$/i;

export function readGroups(value: string | null | undefined): Groups {
  const out: Groups = { divisions: [], bunks: [], thursday: null };
  for (const g of splitList(value ?? null)) {
    if (THURSDAY.test(g)) out.thursday ??= g;
    else if (BUNK.test(g)) {
      const b = cleanBunkName(g);
      if (b && !out.bunks.includes(b)) out.bunks.push(b);
    } else if (DIVISION.test(g) && !out.divisions.includes(g)) out.divisions.push(g);
  }
  return out;
}
