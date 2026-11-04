/**
 * Which staff member already in Kinus each row of a staff sheet is, if any.
 *
 *   1. Their registration id (Boldrr / Staff ID): the surest.
 *   2. Their email, unless that person already has another registration id: brothers whose
 *      registration gives one family email are different people.
 *   3. For people listed without an email: their name, again unless that person already has
 *      another registration id (a counselor and their Thursday Program row, two ids, are two
 *      records).
 *
 * One person is never matched by two rows (the first row that fits takes them). A new row whose
 * email someone else already has (in Kinus, or an earlier row) comes in without it, and says so.
 */
export type SheetRow = { name: string; email: string; sourceId: string };
export type KnownPerson = { id: string; email: string; full_name: string; source_id: string | null; placeholder: boolean };
export type RowMatch = { existingId: string | null; dropEmail: boolean; warning?: string };

export function matchStaffRows(rows: SheetRow[], people: KnownPerson[], sameName: (a: string, b: string) => boolean): RowMatch[] {
  const out: RowMatch[] = rows.map(() => ({ existingId: null, dropEmail: false }));
  const taken = new Set<string>();
  // their own id first, for every row, so a name or email can't take someone whose id comes later
  rows.forEach((r, i) => {
    const id = r.sourceId.trim();
    const p = id ? people.find((x) => x.source_id === id && !taken.has(x.id)) : undefined;
    if (p) {
      out[i].existingId = p.id;
      taken.add(p.id);
    }
  });
  const free = (p: KnownPerson, r: SheetRow) => !taken.has(p.id) && (!p.source_id || !r.sourceId.trim() || p.source_id === r.sourceId.trim());
  rows.forEach((r, i) => {
    if (out[i].existingId) return;
    const email = r.email.trim().toLowerCase();
    const p = email ? people.find((x) => x.email.toLowerCase() === email && free(x, r)) : people.find((x) => x.placeholder && sameName(x.full_name, r.name) && free(x, r));
    if (p) {
      out[i].existingId = p.id;
      taken.add(p.id);
    }
  });
  // a new person can't have an email someone else has: one email, one sign-in
  const used = new Map<string, string>();
  for (const p of people) if (p.email && !p.placeholder) used.set(p.email.toLowerCase(), p.full_name);
  rows.forEach((r, i) => {
    const email = r.email.trim().toLowerCase();
    if (!email) return;
    if (out[i].existingId) {
      used.set(email, r.name);
      return;
    }
    const other = used.get(email);
    if (other !== undefined) {
      out[i].dropEmail = true;
      out[i].warning = `Shares the email ${r.email} with ${other}: added without it (one email signs one person in).`;
    } else used.set(email, r.name);
  });
  return out;
}
