import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getActiveSession } from "@/lib/auth/current-user";
import { campDivisions, templateDivisionIds, templateSkipsDivisionIds } from "./template-camps";
import { forCampers } from "./staff-values";

/** A tag staff can ask for from a camper card, how many of it a camper usually gets, and whose (null: every camp's). */
export type TemplateButton = { id: string; name: string; copies: number; divisionIds: string[] | null; /** not for these (camps that get name tags only) */ skipDivisionIds?: string[] };

/**
 * The templates with a button on the camper card. Reads whole rows so it keeps working
 * before migrations 0028 (copies) and 0036 (camps) are run.
 */
export async function loadCardTemplates(db: SupabaseClient<Database>): Promise<TemplateButton[]> {
  const [{ data }, session] = await Promise.all([
    // just what the buttons need (not every template's parts)
    db.from("print_templates").select("id, name, kind, copies, camps, audience").eq("show_on_card", true).not("name", "like", "(retired)%").order("sort_order").order("name"),
    getActiveSession(),
  ]);
  const camps = session ? await campDivisions(db, session.id) : [];
  return (data ?? []).filter(forCampers).map((t) => ({ id: t.id, name: t.name, copies: Math.min(10, Math.max(1, Number((t as { copies?: number }).copies) || 1)), divisionIds: templateDivisionIds(t, camps), skipDivisionIds: templateSkipsDivisionIds(t, camps) }));
}
