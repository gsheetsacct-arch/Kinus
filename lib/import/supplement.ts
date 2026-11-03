import { displaySourceId } from "./programs";

/**
 * A short file with extra details for some campers (their registration ID and a few columns):
 * which column holds the ID, and which camper each row is.
 */

/** The registration-ID column: students.id, "Registration ID", "Student ID", "ID"… */
export function guessIdColumn(headers: string[]): string | null {
  const norm = (h: string) => h.trim().toLowerCase().replace(/[#_\s-]+/g, " ").replace(/\./g, " ");
  const ranked = [/^students? id$/, /^registration id$/, /^reg(istration)? ?(no|number|#)?$/, /^student (no|number)$/, /^(camper )?id$/, /\bstudents? id\b/, /\bregistration id\b/];
  for (const re of ranked) {
    const hit = headers.find((h) => re.test(norm(h)));
    if (hit) return hit;
  }
  return null;
}

/** Each row's camper, by registration ID (a separate program's campers keep theirs behind a prefix). */
export function matchRows(
  rows: Record<string, string>[],
  idColumn: string,
  campers: { id: string; source_id: string | null }[],
): { matched: { camperId: string; row: Record<string, string> }[]; unmatched: string[]; noId: number } {
  const byId = new Map<string, string>();
  for (const c of campers) {
    if (!c.source_id) continue;
    byId.set(c.source_id.trim().toLowerCase(), c.id);
    const plain = displaySourceId(c.source_id)?.trim().toLowerCase();
    if (plain && !byId.has(plain)) byId.set(plain, c.id);
  }
  const matched: { camperId: string; row: Record<string, string> }[] = [];
  const unmatched: string[] = [];
  let noId = 0;
  for (const row of rows) {
    // "1234.0" from a spreadsheet that made the ID a number
    const id = String(row[idColumn] ?? "").trim().replace(/\.0+$/, "");
    if (!id) {
      noId++;
      continue;
    }
    const camperId = byId.get(id.toLowerCase());
    if (camperId) matched.push({ camperId, row });
    else unmatched.push(id);
  }
  return { matched, unmatched, noId };
}
