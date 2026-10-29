import "server-only";
import { shownEmail } from "@/lib/staff/login-kinds";
import { createAdminClient } from "@/lib/supabase/admin";
import { phoneBookHeadsOnly, seesAllCamp, type CurrentUser, type StaffRole } from "@/lib/auth/permissions";
import { loadAreaTree } from "@/lib/data/areas";

export type PhoneBookEntry = { id: string; name: string; role: StaffRole; title: string | null; phone: string | null; email: string | null; where: string; you: boolean };
export type PhoneBookSection = { key: string; title: string; color: string | null; entries: PhoneBookEntry[] };

// head staff first, then counselors, then everyone else
const RANK: Record<string, number> = { owner: 0, director: 1, division_head: 2, kloli: 2.5, head_counselor: 3, counselor: 4, scanner: 5, office: 6, logistics: 7 };

/**
 * The phone book for this person: one section per division in their area (its head staff,
 * counselors by bunk, check-in helpers), and one for directors and office over all of camp.
 * Read with the admin client: staff emails and phones aren't readable to staff otherwise.
 */
export async function loadPhoneBook(me: CurrentUser, sessionId: string, campDivisionIds: string[] | null): Promise<PhoneBookSection[]> {
  const admin = createAdminClient();
  const [tree, { data: people }, { data: scopes }] = await Promise.all([
    loadAreaTree(admin, sessionId),
    // check-in logins are phones, not people
    admin.from("profiles").select("id, full_name, role, title, phone, email, all_areas, is_active").eq("is_active", true).neq("login", "shared"),
    admin.from("staff_scopes").select("user_id, group_id, division_id, bunk_id"),
  ]);
  const mine = new Set(me.coverage.map((c) => c.division_id));
  const divisions = tree.divisions.filter((d) => (seesAllCamp(me) || mine.has(d.id)) && (!campDivisionIds || campDivisionIds.includes(d.id)));
  const bunkName = new Map(tree.divisions.flatMap((d) => d.bunks.map((b, i) => [b.id, { name: b.name, order: i }] as const)));
  const groupName = new Map(tree.groups.map((g) => [g.id, g.name]));
  const byUser = new Map<string, { group_id: string | null; division_id: string | null; bunk_id: string | null }[]>();
  for (const s of scopes ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  const entry = (p: NonNullable<typeof people>[number], where: string): PhoneBookEntry => ({ id: p.id, name: p.full_name, role: p.role, title: p.title, phone: p.phone, email: shownEmail(p.email), where, you: p.id === me.id });
  const sort = (list: (PhoneBookEntry & { order: number })[]) => list.sort((a, b) => (RANK[a.role] ?? 9) - (RANK[b.role] ?? 9) || a.order - b.order || a.name.localeCompare(b.name)).map((e) => ({ id: e.id, name: e.name, role: e.role, title: e.title, phone: e.phone, email: e.email, where: e.where, you: e.you }));

  // counselors and check-in helpers: just the head counselors and division heads over them
  const headsOnly = phoneBookHeadsOnly(me);
  const sections: PhoneBookSection[] = divisions.map((d) => {
    const list: (PhoneBookEntry & { order: number })[] = [];
    for (const p of people ?? []) {
      if (p.all_areas || p.role === "owner") continue;
      if (headsOnly && p.role !== "head_counselor" && p.role !== "kloli" && p.role !== "division_head") continue;
      const here = (byUser.get(p.id) ?? []).filter((s) => s.division_id === d.id || (s.group_id && s.group_id === d.group_id));
      if (!here.length) continue;
      const bunks = here.filter((s) => s.bunk_id).map((s) => bunkName.get(s.bunk_id!)!).filter(Boolean);
      const where = here.some((s) => s.group_id) ? `All of ${groupName.get(here.find((s) => s.group_id)!.group_id!) ?? "camp"}` : bunks.length ? bunks.map((b) => b.name).join(", ") : "Whole division";
      list.push({ ...entry(p, where), order: bunks.length ? Math.min(...bunks.map((b) => b.order)) : -1 });
    }
    return { key: d.id, title: d.name, color: d.color, entries: sort(list) };
  });
  const camp = (people ?? []).filter((p) => p.all_areas || p.role === "owner").map((p) => ({ ...entry(p, "All of camp"), order: 0 }));
  if (camp.length && !headsOnly) sections.push({ key: "camp", title: "Whole camp: directors and office", color: null, entries: sort(camp) });
  return sections.filter((s) => s.entries.length);
}
