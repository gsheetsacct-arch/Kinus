import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { columnKey } from "@/lib/import/extra-fields";
import { groupOfKey, UNGATED_GROUPS } from "@/lib/fields";
import { loadExtraFields } from "./extra-fields";

/**
 * The registration (export) columns staff with edit access can correct on a camper: the extra
 * fields shown on the camper page (Sleeping at the Kinus…) and the columns label fields read
 * (Hebrew name, yarmulka size…). A correction is kept as a fix (campers.source_fixes), so new
 * imports keep it, the same as the Hebrew names page.
 */
export type EditableColumn = { column: string; label: string };

const SOURCE = /^\{\{\s*source\.([^{}|]+?)\s*\}\}$/;

export async function editableColumns(): Promise<EditableColumn[]> {
  const [extra, { data: fields }] = await Promise.all([loadExtraFields(), createAdminClient().from("merge_fields").select("label, source_field").order("sort_order")]);
  const out = new Map<string, EditableColumn>();
  for (const f of extra) out.set(columnKey(f.column), { column: f.column, label: f.label });
  for (const f of fields ?? []) {
    const m = SOURCE.exec(f.source_field.trim());
    if (m && !out.has(columnKey(m[1]))) out.set(columnKey(m[1]), { column: m[1].trim(), label: f.label });
  }
  return [...out.values()];
}

/** Only the columns this person may see (a column that looks medical needs medical access…). */
export const visibleColumns = (cols: EditableColumn[], groups: Set<string>) =>
  cols.filter((c) => {
    const g = groupOfKey(`source.${c.column}`);
    return UNGATED_GROUPS.includes(g) || groups.has(g);
  });
