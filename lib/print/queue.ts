import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { CurrentUser } from "@/lib/auth/permissions";
import { jobIdsInDivisions, myAreaJobIds, scopedQueue } from "./access";

/** Requests still to print: made or being made, not printed or cancelled. */
export const TO_PRINT = ["queued", "rendering", "ready", "sent"] as const;

/**
 * Which part of the print queue this person is looking at: someone over part of camp only
 * their divisions' requests (and their own); then the camp, or division, picked in the bars.
 */
export async function queueScope(user: CurrentUser, sessionId: string, pick: { camp?: string | null; division?: string | null }) {
  const scoped = scopedQueue(user);
  const admin = createAdminClient();
  const [mine, { data: divisionRows }, { data: groupRows }] = await Promise.all([
    scoped ? myAreaJobIds(user, sessionId) : Promise.resolve(null),
    admin.from("divisions").select("id, name, group_id").eq("session_id", sessionId).order("sort_order"),
    admin.from("division_groups").select("id, name").eq("session_id", sessionId).order("sort_order").order("name"),
  ]);
  // only their own divisions in the bars (one division: no bars at all)
  const divisions = (divisionRows ?? []).filter((d) => !scoped || user.coverage.some((c) => c.division_id === d.id));
  const firstCamp = groupRows?.[0]?.id ?? null;
  const campOf = (d: { group_id: string | null }) => d.group_id ?? firstCamp;
  const camps = (groupRows ?? []).filter((g) => divisions.some((d) => campOf(d) === g.id));
  const division = divisions.find((d) => d.id === pick.division) ?? null;
  const camp = camps.find((g) => g.id === (division ? campOf(division) : pick.camp)) ?? null;
  const campDivisions = camp ? divisions.filter((d) => campOf(d) === camp.id) : divisions;
  const only = division ? [division.id] : camp && camps.length > 1 ? campDivisions.map((d) => d.id) : null;
  const inDivision = only ? await jobIdsInDivisions(sessionId, only) : null;
  const shows = (id: string) => (!mine || mine.has(id)) && (!inDivision || inDivision.has(id));
  return { scoped, mine, divisions, camps, camp, division, campDivisions, shows };
}

export type WaitingSet = { key: string; ids: string[]; tags: number; templates: string[]; templateIds: string[]; size: string };

/**
 * The labels still to print for a label printer (one label a page: the check-in name tag and
 * bag label, packing labels…), in this part of the queue (queueScope's shows), by label size:
 * each size prints as one set on its printer, each camper's labels together. Label sheets
 * print on their own (Print together).
 */
export async function waitingSets(sessionId: string, shows: (jobId: string) => boolean): Promise<WaitingSet[]> {
  const jobs = await fetchAll((from, to) =>
    createAdminClient()
      .from("print_jobs")
      .select("id, item_count, template_id, print_templates(name, sort_order, page_width_mm, page_height_mm, sheet_layout, thermal)")
      .eq("session_id", sessionId)
      .in("status", [...TO_PRINT])
      .not("template_id", "is", null)
      .order("id")
      .range(from, to),
  );
  const sets = new Map<string, WaitingSet & { order: Map<string, number> }>();
  for (const j of jobs) {
    const t = j.print_templates as { name: string; sort_order: number | null; page_width_mm: number; page_height_mm: number; sheet_layout: unknown; thermal: boolean | null } | null;
    if (!t || t.sheet_layout || !shows(j.id)) continue;
    // one set per label size (and thermal or not: they go through the printer differently)
    const key = `${Math.round(t.page_width_mm)}x${Math.round(t.page_height_mm)}${t.thermal ? "t" : ""}`;
    const s = sets.get(key) ?? { key, ids: [] as string[], tags: 0, templates: [] as string[], templateIds: [] as string[], size: `${Math.round(t.page_width_mm)} × ${Math.round(t.page_height_mm)} mm`, order: new Map<string, number>() };
    s.ids.push(j.id);
    s.tags += j.item_count;
    s.order.set(t.name, t.sort_order ?? 0);
    if (!s.templateIds.includes(j.template_id!)) s.templateIds.push(j.template_id!);
    sets.set(key, s);
  }
  return [...sets.values()]
    .map(({ order, ...s }) => ({ ...s, templates: [...order.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([n]) => n) }))
    .sort((a, b) => b.tags - a.tags);
}
