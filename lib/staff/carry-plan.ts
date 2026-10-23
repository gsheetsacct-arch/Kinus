/**
 * Staff areas (camps, divisions, bunks) belong to one session. A session started without
 * "copy staff" leaves everyone's areas in the last session, so they see none of the new
 * campers (only the owner and all-of-camp people do). This works out the same places in
 * the new session, by name: a camp by its name, a division by its name, a bunk by its
 * division's name and its own. Only for people with no area in the new session at all,
 * so an area someone changed or took away there stays as they left it.
 */
export type ScopeRow = { user_id: string; group_id: string | null; division_id: string | null; bunk_id: string | null; created_by: string | null };
export type Place = { id: string; name: string; session_id: string };
export type BunkPlace = { id: string; name: string; division_id: string };
export type NewScope = { user_id: string; group_id: string | null; division_id: string | null; bunk_id: string | null; created_by: string | null };

const key = (s: string) => s.trim().toLowerCase();

export function carryPlan(target: string, scopes: ScopeRow[], groups: Place[], divisions: Place[], bunks: BunkPlace[]): NewScope[] {
  const group = new Map(groups.map((g) => [g.id, g]));
  const division = new Map(divisions.map((d) => [d.id, d]));
  const bunk = new Map(bunks.map((b) => [b.id, b]));
  const inTarget = (s: ScopeRow) => (s.group_id ? group.get(s.group_id)?.session_id : division.get(s.division_id ?? "")?.session_id) === target;
  const targetGroup = new Map(groups.filter((g) => g.session_id === target).map((g) => [key(g.name), g.id]));
  const targetDivision = new Map(divisions.filter((d) => d.session_id === target).map((d) => [key(d.name), d.id]));
  const targetBunk = new Map(bunks.filter((b) => division.get(b.division_id)?.session_id === target).map((b) => [`${b.division_id}|${key(b.name)}`, b.id]));

  const byUser = new Map<string, ScopeRow[]>();
  for (const s of scopes) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  const out: NewScope[] = [];
  for (const [user, rows] of byUser) {
    if (rows.some(inTarget)) continue;
    const seen = new Set<string>();
    for (const s of rows) {
      let row: NewScope | null = null;
      if (s.group_id) {
        const g = group.get(s.group_id);
        const id = g && targetGroup.get(key(g.name));
        if (id) row = { user_id: user, group_id: id, division_id: null, bunk_id: null, created_by: s.created_by };
      } else {
        const d = division.get(s.division_id ?? "");
        const dId = d && targetDivision.get(key(d.name));
        if (dId && !s.bunk_id) row = { user_id: user, group_id: null, division_id: dId, bunk_id: null, created_by: s.created_by };
        if (dId && s.bunk_id) {
          // a bunk only to the same bunk: never more than the person had
          const b = bunk.get(s.bunk_id);
          const bId = b && targetBunk.get(`${dId}|${key(b.name)}`);
          if (bId) row = { user_id: user, group_id: null, division_id: dId, bunk_id: bId, created_by: s.created_by };
        }
      }
      const k = row && `${row.group_id}|${row.division_id}|${row.bunk_id}`;
      if (row && k && !seen.has(k)) {
        seen.add(k);
        out.push(row);
      }
    }
  }
  return out;
}
