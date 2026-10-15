import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;

/**
 * Templates can be for some camps only (American, Hebrew…): `print_templates.camps` holds
 * camp names (migration 0036), so it carries over to next session's camps. None: every camp.
 */
export function templateCamps(t: unknown): string[] {
  const raw = (t as { camps?: unknown } | null)?.camps;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether a template is for this camp (by name; null = no camp chosen: every template). */
export const forCamp = (t: unknown, camp: string | null | undefined) => {
  const camps = templateCamps(t);
  return !camps.length || !camp || camps.some((c) => same(c, camp));
};

/** This session's camps by name, with their divisions (a division with no camp belongs to the first, as everywhere). */
export async function campDivisions(db: DB, sessionId: string): Promise<{ name: string; divisionIds: string[] }[]> {
  const [{ data: groups }, { data: divisions }] = await Promise.all([
    db.from("division_groups").select("id, name").eq("session_id", sessionId).order("sort_order").order("name"),
    db.from("divisions").select("id, group_id").eq("session_id", sessionId),
  ]);
  const first = groups?.[0]?.id;
  return (groups ?? []).map((g) => ({ name: g.name, divisionIds: (divisions ?? []).filter((d) => (d.group_id ?? first) === g.id).map((d) => d.id) }));
}

/** The divisions a template prints for (null: all of them). */
export function templateDivisionIds(t: unknown, camps: { name: string; divisionIds: string[] }[]): string[] | null {
  const want = templateCamps(t);
  if (!want.length) return null;
  return camps.filter((c) => want.some((w) => same(w, c.name))).flatMap((c) => c.divisionIds);
}

/** The camp a camper's division is in (by name), or null. */
export async function camperCampName(db: DB, divisionId: string | null): Promise<string | null> {
  if (!divisionId) return null;
  const { data } = await db.from("divisions").select("session_id, group_id, division_groups(name)").eq("id", divisionId).maybeSingle();
  if (!data) return null;
  const own = (data.division_groups as { name: string } | null)?.name;
  if (own) return own;
  // no camp set: the session's first camp
  const { data: first } = await db.from("division_groups").select("name").eq("session_id", data.session_id).order("sort_order").order("name").limit(1).maybeSingle();
  return first?.name ?? null;
}
