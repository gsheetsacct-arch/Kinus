import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { groupOfKey, UNGATED_GROUPS } from "@/lib/fields";
import { extraValue, parseExtraFields, shortAnswer, type ExtraField } from "@/lib/import/extra-fields";

/** The export columns chosen to show (Import → column step → "Show on the camper page"). */
export async function loadExtraFields(): Promise<ExtraField[]> {
  const { data } = await createAdminClient().from("settings").select("value").eq("key", "extra_fields").maybeSingle();
  return parseExtraFields(data?.value);
}

/** Export columns left out of the column choices (settings.hidden_columns), e.g. the form's address when the family record's is used. */
export async function loadHiddenColumns(): Promise<string[]> {
  const { data } = await createAdminClient().from("settings").select("value").eq("key", "hidden_columns").maybeSingle();
  return Array.isArray(data?.value) ? (data.value as unknown[]).filter((x): x is string => typeof x === "string") : [];
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
export async function extraValuesFor(camperIds: string[], fields: (Pick<ExtraField, "column" | "answers"> & { label?: string })[]): Promise<Map<string, Record<string, string>>> {
  const out = new Map<string, Record<string, string>>();
  if (!fields.length || !camperIds.length) return out;
  const admin = createAdminClient();
  const ids = [...new Set(camperIds)];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
  const parts = await Promise.all(chunks.map((chunk) => admin.from("campers").select("id, source_data").in("id", chunk)));
  for (const { data, error } of parts) {
    if (error) throw error;
    for (const c of data ?? []) out.set(c.id, Object.fromEntries(fields.map((f) => [f.column, shortAnswer(f, extraValue(c.source_data, f.column))])));
  }
  return out;
}

/**
 * The different answers each extra field has in this session, most common first (for
 * setting short answers). A field with too many different answers (free text) gets none.
 */
export async function extraAnswers(sessionId: string, fields: ExtraField[], max = 30): Promise<Map<string, { value: string; count: number }[] | null>> {
  const out = new Map<string, { value: string; count: number }[] | null>();
  if (!fields.length) return out;
  const { fetchAll } = await import("@/lib/supabase/fetch-all");
  const rows = await fetchAll((from, to) => createAdminClient().from("campers").select("id, source_data").eq("session_id", sessionId).is("archived_at", null).order("id").range(from, to));
  for (const f of fields) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const v = extraValue(r.source_data, f.column);
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    out.set(f.column, counts.size > max ? null : [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count })));
  }
  return out;
}
