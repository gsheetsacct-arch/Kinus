import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { carryPlan } from "./carry-plan";

// people whose areas couldn't be carried (no same names in the new session): not retried
// on every page for a while
const tried = new Map<string, number>();
const RETRY_MS = 10 * 60 * 1000;

/**
 * Gives staff whose areas are all in earlier sessions the same camps, divisions and bunks in
 * `sessionId` (by name; see carry-plan). Everyone, or only `userIds`. Returns how many areas
 * were added. Never throws: a failure leaves areas as they were.
 */
export async function carryAreasTo(sessionId: string, userIds?: string[]): Promise<number> {
  try {
    const admin = createAdminClient();
    let q = admin.from("staff_scopes").select("user_id, group_id, division_id, bunk_id, created_by, profiles!staff_scopes_user_id_fkey!inner(is_active, role, all_areas)");
    if (userIds) q = q.in("user_id", userIds);
    const { data: scopes, error } = await q;
    if (error) throw error;
    // owners and all-of-camp people see everything anyway
    const rows = (scopes ?? []).filter((s) => {
      const p = s.profiles as unknown as { is_active: boolean; role: string; all_areas: boolean };
      return p.is_active && p.role !== "owner" && !p.all_areas;
    });
    if (!rows.length) return 0;
    const [{ data: groups }, { data: divisions }, { data: bunks }] = await Promise.all([
      admin.from("division_groups").select("id, name, session_id"),
      admin.from("divisions").select("id, name, session_id"),
      admin.from("bunks").select("id, name, division_id"),
    ]);
    const plan = carryPlan(
      sessionId,
      rows.map(({ user_id, group_id, division_id, bunk_id, created_by }) => ({ user_id, group_id, division_id, bunk_id, created_by })),
      groups ?? [],
      divisions ?? [],
      bunks ?? [],
    );
    if (!plan.length) return 0;
    const { error: e2 } = await admin.from("staff_scopes").insert(plan);
    if (e2) throw e2;
    return plan.length;
  } catch (e) {
    console.error("Carrying staff areas into the session failed", e);
    return 0;
  }
}

/** For one signed-in person whose areas are all elsewhere: carry them now (at most every few minutes). */
export async function carryMyAreas(sessionId: string, userId: string): Promise<boolean> {
  const k = `${sessionId}|${userId}`;
  const last = tried.get(k);
  if (last && Date.now() - last < RETRY_MS) return false;
  tried.set(k, Date.now());
  return (await carryAreasTo(sessionId, [userId])) > 0;
}
