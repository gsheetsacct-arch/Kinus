import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { NAME_TAGS_ONLY_KEY, isNameTag, nameTagsOnlyRule } from "./name-tags-only";

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

/**
 * Whether a template kept to camp `want` ("American") is for camp `camp`. By name only: a
 * Thursday Program camp ("Thursday American") gets just the templates that list it (the badges),
 * not the regular camp's luggage tags or packing labels.
 */
export const campMatches = (want: string, camp: string) => same(want, camp);

/**
 * Whether a template is for this camp (by name; null = no camp chosen: every template). A camp
 * that gets name tags only (`nameTagsOnly`) gets just name tags, and templates that list it.
 */
export const forCamp = (t: unknown, camp: string | null | undefined, nameTagsOnly = false) => {
  const camps = templateCamps(t);
  if (camps.length) return !camp || camps.some((c) => campMatches(c, camp));
  return !camp || !nameTagsOnly || isNameTag(t);
};

/** Which camps (by name) get name tags only (Settings), as a test. */
export async function loadNameTagsOnly(): Promise<(camp: string) => boolean> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data } = await createAdminClient().from("settings").select("value").eq("key", NAME_TAGS_ONLY_KEY).maybeSingle();
  return nameTagsOnlyRule(data?.value);
}

export type CampDivisions = { name: string; divisionIds: string[]; /** gets name tags only (Settings) */ nameTagsOnly?: boolean };

/** This session's camps by name, with their divisions (a division with no camp belongs to the first, as everywhere). */
export async function campDivisions(db: DB, sessionId: string): Promise<CampDivisions[]> {
  const [{ data: groups }, { data: divisions }, only] = await Promise.all([
    db.from("division_groups").select("id, name").eq("session_id", sessionId).order("sort_order").order("name"),
    db.from("divisions").select("id, group_id").eq("session_id", sessionId),
    loadNameTagsOnly(),
  ]);
  const first = groups?.[0]?.id;
  return (groups ?? []).map((g) => ({ name: g.name, divisionIds: (divisions ?? []).filter((d) => (d.group_id ?? first) === g.id).map((d) => d.id), nameTagsOnly: only(g.name) }));
}

/** The divisions a template prints for, when it lists camps (null: it doesn't). */
export function templateDivisionIds(t: unknown, camps: CampDivisions[]): string[] | null {
  const want = templateCamps(t);
  if (!want.length) return null;
  return camps.filter((c) => want.some((w) => campMatches(w, c.name))).flatMap((c) => c.divisionIds);
}

/**
 * The divisions a template that lists no camps leaves out: those of the camps that get name tags
 * only, unless it's a name tag. (A template that lists camps prints for just those.)
 */
export function templateSkipsDivisionIds(t: unknown, camps: CampDivisions[]): string[] {
  if (templateCamps(t).length || isNameTag(t)) return [];
  return camps.filter((c) => c.nameTagsOnly).flatMap((c) => c.divisionIds);
}

/** The camp (by name) a division is in. */
export const campOfDivision = (camps: CampDivisions[], divisionId: string | null | undefined) => (divisionId ? (camps.find((c) => c.divisionIds.includes(divisionId))?.name ?? null) : null);

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
