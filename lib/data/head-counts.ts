import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { LEVEL_RANK, effectiveLevel, isDirector, seesAllCamp, type CurrentUser } from "@/lib/auth/permissions";
import type { CountCamper, CountMark } from "@/lib/head-counts";

/** Head staff and up start head counts (and close them). */
export const canStartCount = (u: CurrentUser) => !u.checkinLogin && (isDirector(u) || u.role === "division_head" || u.role === "head_kloli" || u.role === "kloli" || u.role === "head_counselor");
/** Whoever can check kids in can count them. */
export const canCount = (u: CurrentUser) => LEVEL_RANK[effectiveLevel(u)] >= LEVEL_RANK.scan;
/** The divisions someone may start a count for (null: all of them). */
export const countDivisionIds = (u: CurrentUser): string[] | null => (seesAllCamp(u) ? null : [...new Set(u.coverage.map((c) => c.division_id))]);
/** A count is someone's to see and count in when it covers one of their divisions. */
export const seesCount = (u: CurrentUser, divisionIds: string[]) => seesAllCamp(u) || divisionIds.some((d) => u.coverage.some((c) => c.division_id === d));

export type HeadCount = { id: string; name: string; division_ids: string[]; groups: string[]; created_by: string | null; created_by_name: string; created_at: string; closed_at: string | null; closed_by_name: string | null };

export async function loadCount(id: string): Promise<HeadCount | null> {
  const { data } = await createAdminClient().from("head_counts").select("id, name, division_ids, groups, created_by, created_by_name, created_at, closed_at, closed_by_name").eq("id", id).maybeSingle();
  return data;
}

/** Every camper of the count's divisions (any status: one who's out may still turn up on the bus). */
export async function countCampers(sessionId: string, divisionIds: string[]): Promise<CountCamper[]> {
  const admin = createAdminClient();
  const [rows, { data: bunks }] = await Promise.all([
    fetchAll((from, to) =>
      admin
        .from("campers")
        .select("id, display_name, first_name, last_name, camper_code, division_id, bunk_id, status")
        .eq("session_id", sessionId)
        .is("archived_at", null)
        .in("division_id", divisionIds)
        .order("id")
        .range(from, to),
    ),
    admin.from("bunks").select("id, name").in("division_id", divisionIds),
  ]);
  const bunk = new Map((bunks ?? []).map((b) => [b.id, b.name]));
  return rows.map((c) => ({
    id: c.id,
    name: c.display_name ?? `${c.first_name} ${c.last_name}`,
    last: c.last_name,
    code: c.camper_code,
    divisionId: c.division_id,
    bunk: c.bunk_id ? (bunk.get(c.bunk_id) ?? null) : null,
    status: c.status,
  }));
}

export async function countMarks(countId: string): Promise<CountMark[]> {
  const { data } = await createAdminClient().from("head_count_marks").select("camper_id, group_name, marked_by_name, marked_at, method").eq("head_count_id", countId);
  return (data ?? []).map((m) => ({ camperId: m.camper_id, group: m.group_name, by: m.marked_by_name, at: m.marked_at, method: m.method === "manual" ? "manual" : "scan" }));
}
