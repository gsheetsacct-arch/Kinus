import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession } from "@/lib/auth/current-user";
import { canFinalCheckout, type CurrentUser } from "@/lib/auth/permissions";
import { getCampContext } from "@/lib/data/camp";

export type CheckoutDivision = { id: string; name: string; color: string | null };
export type CheckoutScope = { sessionId: string; campName: string; divisions: CheckoutDivision[] };

/**
 * What Final check-out covers for this person: every division of their camp. A check-in
 * login given final check-out: the camp(s) its own division is in (the database allows the
 * same, migration 0029). A director over all of camp: the camp chosen at the top of the menu.
 * Null when they can't use it.
 */
export async function checkoutScope(user: CurrentUser): Promise<CheckoutScope | null> {
  if (!canFinalCheckout(user)) return null;
  const session = await getActiveSession();
  if (!session) return null;
  const admin = createAdminClient();
  const [{ data: groups }, { data: divisions }] = await Promise.all([
    admin.from("division_groups").select("id, name, sort_order").eq("session_id", session.id).order("sort_order").order("name"),
    admin.from("divisions").select("id, name, color, group_id, sort_order").eq("session_id", session.id).order("sort_order").order("name"),
  ]);
  const all = divisions ?? [];
  let campIds: Set<string | null>;
  if (user.finalCheckout) {
    const mine = new Set(user.coverage.map((c) => c.division_id));
    campIds = new Set(all.filter((d) => mine.has(d.id)).map((d) => d.group_id));
  } else {
    const ctx = await getCampContext();
    campIds = new Set(ctx.current ? [ctx.current.id] : all.map((d) => d.group_id));
  }
  const inScope = all.filter((d) => d.group_id && campIds.has(d.group_id));
  if (!inScope.length) return null;
  const names = (groups ?? []).filter((g) => campIds.has(g.id)).map((g) => g.name);
  return {
    sessionId: session.id,
    campName: names.length === 1 ? names[0] : names.length ? names.join(" & ") : "camp",
    divisions: inScope.map((d) => ({ id: d.id, name: d.name, color: d.color })),
  };
}
