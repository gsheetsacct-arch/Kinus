import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, getCurrentUser } from "@/lib/auth/current-user";
import { visibleDivisionIds } from "@/lib/auth/permissions";

export const CAMP_COOKIE = "kinus-camp";
export const ALL_CAMPS = "all";

export type Camp = { id: string; name: string; divisionIds: string[] };
export type CampContext = {
  /** Camps this person can see, in order; the first is where people start. */
  camps: Camp[];
  /** null = all camps. */
  current: Camp | null;
  /** Divisions in the current camp the person can see (null = no filter needed). */
  divisionIds: string[] | null;
};

/**
 * The camp a person is looking at (American, Hebrew, French…). Remembered per device;
 * starts at the first camp they can see, so even owners start in the main camp.
 */
export const getCampContext = cache(async (): Promise<CampContext> => {
  const [user, session] = await Promise.all([getCurrentUser(), getActiveSession()]);
  if (!user || !session) return { camps: [], current: null, divisionIds: null };
  const supabase = await createClient();
  const [{ data: groups }, { data: divisions }] = await Promise.all([
    supabase.from("division_groups").select("id, name, sort_order").eq("session_id", session.id).order("sort_order").order("name"),
    supabase.from("divisions").select("id, group_id").eq("session_id", session.id),
  ]);
  const allowed = visibleDivisionIds(user);
  const visible = (divisions ?? []).filter((d) => !allowed || allowed.includes(d.id));
  const first = groups?.[0]?.id;
  const camps = (groups ?? [])
    .map((g) => ({ id: g.id, name: g.name, divisionIds: visible.filter((d) => (d.group_id ?? first) === g.id).map((d) => d.id) }))
    .filter((c) => c.divisionIds.length > 0);
  if (camps.length <= 1) return { camps, current: camps[0] ?? null, divisionIds: allowed };
  const chosen = (await cookies()).get(CAMP_COOKIE)?.value;
  if (chosen === ALL_CAMPS) return { camps, current: null, divisionIds: allowed };
  const current = camps.find((c) => c.id === chosen) ?? camps[0];
  return { camps, current, divisionIds: current.divisionIds };
});

/** Whether a division is in the camp being looked at. */
export const inCurrentCamp = (ctx: CampContext, divisionId: string | null | undefined) => !ctx.divisionIds || (divisionId ? ctx.divisionIds.includes(divisionId) : !ctx.current);
