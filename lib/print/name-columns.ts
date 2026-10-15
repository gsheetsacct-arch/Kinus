import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { canAccessBunk, canUsePrintArea, effectiveLevel, seesAllCamp, type CurrentUser } from "@/lib/auth/permissions";

export type NameColumn = { column: string; label: string; kind: "first" | "last" };

/**
 * The export columns that hold Hebrew names: the ones the Hebrew-name label fields read
 * ("Hebrew name" → {{source.ppa.hebrew_name}}). First or last name, by their wording.
 */
export async function hebrewNameColumns(db: SupabaseClient<Database>): Promise<NameColumn[]> {
  const { data } = await db.from("merge_fields").select("key, label, source_field").order("sort_order");
  const out = new Map<string, NameColumn>();
  for (const f of data ?? []) {
    const m = f.source_field.trim().match(/^\{\{\s*source\.([^{}|]+?)\s*\}\}$/);
    if (!m) continue;
    const words = `${f.key} ${f.label} ${m[1]}`;
    if (!/hebrew|heb\b|heb_|עברית/i.test(words) || !/name|first|last|_first|_last/i.test(words)) continue;
    const column = m[1].trim();
    const key = column.toLowerCase().replace(/#/g, ".");
    if (!out.has(key)) out.set(key, { column, label: f.label, kind: /last|family|surname/i.test(words) ? "last" : "first" });
  }
  return [...out.values()];
}

/** Who fixes names: the print area at edit level. */
export const canFixNames = (u: CurrentUser) => canUsePrintArea(u) && effectiveLevel(u) === "edit";

/** ...for campers in their own part of camp. */
export const canFixNamesFor = (u: CurrentUser, c: { division_id: string | null; bunk_id: string | null }) =>
  canFixNames(u) && (c.division_id ? canAccessBunk(u, c.division_id, c.bunk_id, "edit") : seesAllCamp(u));
