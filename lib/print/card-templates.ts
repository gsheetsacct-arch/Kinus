import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getActiveSession } from "@/lib/auth/current-user";
import { campDivisions, templateDivisionIds } from "./template-camps";

/** A tag staff can ask for from a camper card, how many of it a camper usually gets, and whose (null: every camp's). */
export type TemplateButton = { id: string; name: string; copies: number; divisionIds: string[] | null };

/**
 * The templates with a button on the camper card. Reads whole rows so it keeps working
 * before migrations 0028 (copies) and 0036 (camps) are run.
 */
export async function loadCardTemplates(db: SupabaseClient<Database>): Promise<TemplateButton[]> {
  const [{ data }, session] = await Promise.all([
    db.from("print_templates").select("*").eq("show_on_card", true).not("name", "like", "(retired)%").order("sort_order").order("name"),
    getActiveSession(),
  ]);
  const camps = session && (data ?? []).some((t) => (t as { camps?: string[] }).camps?.length) ? await campDivisions(db, session.id) : [];
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, copies: Math.min(10, Math.max(1, Number((t as { copies?: number }).copies) || 1)), divisionIds: templateDivisionIds(t, camps) }));
}
