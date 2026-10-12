import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { groupOfKey, UNGATED_GROUPS } from "@/lib/fields";
import { extraValue, parseExtraFields, type ExtraField } from "@/lib/import/extra-fields";

/** The export columns chosen to show (Import → column step → "Show on the camper page"). */
export async function loadExtraFields(): Promise<ExtraField[]> {
  const { data } = await createAdminClient().from("settings").select("value").eq("key", "extra_fields").maybeSingle();
  return parseExtraFields(data?.value);
}

/** Only the extra fields this person may see: a column that looks medical needs medical access, and so on. */
export const visibleExtraFields = (fields: ExtraField[], groups: Set<string>) =>
  fields.filter((f) => {
    const g = groupOfKey(`source.${f.column}`);
    return UNGATED_GROUPS.includes(g) || groups.has(g);
  });

/**
 * Extra field values for campers the person can already see (the raw export row isn't
 * readable to staff, so it's read here, for these campers and columns only).
 */
export async function extraValuesFor(camperIds: string[], fields: ExtraField[]): Promise<Map<string, Record<string, string>>> {
  const out = new Map<string, Record<string, string>>();
  if (!fields.length || !camperIds.length) return out;
  const admin = createAdminClient();
  const ids = [...new Set(camperIds)];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
  const parts = await Promise.all(chunks.map((chunk) => admin.from("campers").select("id, source_data").in("id", chunk)));
  for (const { data, error } of parts) {
    if (error) throw error;
    for (const c of data ?? []) out.set(c.id, Object.fromEntries(fields.map((f) => [f.column, extraValue(c.source_data, f.column)])));
  }
  return out;
}
