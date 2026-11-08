import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession } from "@/lib/auth/current-user";
import { canFinalCheckout, type CurrentUser } from "@/lib/auth/permissions";
import { getCampContext } from "@/lib/data/camp";

export type CheckoutDivision = { id: string; name: string; color: string | null };
export type CheckoutScope = { sessionId: string; campName: string; divisions: CheckoutDivision[] };

/**
 * What Final check-out covers for this person: every division of each camp they check out in.
 * The final check-outs set up for their kind of account (every camp of each one that covers a
 * camp they work in), and a login or helper given it alone: their own camp (the database allows
 * the same, migrations 0029 and 0069). A director over all of camp: the camp chosen at the top of the menu.
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
  // every camp they check out in, together: the final check-outs set up for them (Final
  // check-out → Set up), their own camp when it's turned on for them alone, and for directors
  // over all of camp the camp chosen at the top of the menu
  const campIds = new Set<string | null>(user.checkoutCamps ?? []);
  if (user.finalCheckout) {
    const mine = new Set(user.coverage.map((c) => c.division_id));
    for (const d of all) if (mine.has(d.id)) campIds.add(d.group_id);
  }
  if (!user.finalCheckout && !user.checkoutCamps?.length) {
    const ctx = await getCampContext();
    for (const id of ctx.current ? [ctx.current.id] : all.map((d) => d.group_id)) campIds.add(id);
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
