import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** A tag staff can ask for from a camper card, and how many of it a camper usually gets. */
export type TemplateButton = { id: string; name: string; copies: number };

/**
 * The templates with a button on the camper card. Reads whole rows so it keeps working
 * before migration 0028 (copies) is run: then every tag is one each.
 */
export async function loadCardTemplates(db: SupabaseClient<Database>): Promise<TemplateButton[]> {
  const { data } = await db.from("print_templates").select("*").eq("show_on_card", true).not("name", "like", "(retired)%").order("sort_order").order("name");
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, copies: Math.min(10, Math.max(1, Number((t as { copies?: number }).copies) || 1)) }));
}
