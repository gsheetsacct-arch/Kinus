import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Staff tag fixes, person by person, keyed by their registration id ({{STAFF_ID}}, e.g.
 * KTH87-305), never by name: { "KTH87-305": { ROLE_HE: "קלולי" } }. A fix replaces what that
 * field would say on their tags (the staff list itself is unchanged). Kept in settings
 * ("staff_fixes"), so a new upload of the staff sheet keeps them.
 */
export type StaffFixes = Record<string, Record<string, string>>;

/** Fields a fix may set: the staff tag's own conversions (not names, ids or contact details). */
export const FIXABLE_STAFF_FIELDS = ["ROLE_HE", "BUNK_HE", "POSITION", "DIVISION"] as const;

export async function loadStaffFixes(): Promise<StaffFixes> {
  const { data } = await createAdminClient().from("settings").select("value").eq("key", "staff_fixes").maybeSingle();
  const v = data?.value;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as StaffFixes) : {};
}

/** Sets (or, with an empty value, takes back) fixes; returns them all. */
export async function saveStaffFixes(changes: { staffId: string; field: string; value: string }[], userId: string): Promise<StaffFixes> {
  const fixes = await loadStaffFixes();
  for (const c of changes) {
    const id = c.staffId.trim();
    if (!id) continue;
    const row = { ...(fixes[id] ?? {}) };
    if (c.value.trim()) row[c.field] = c.value.trim();
    else delete row[c.field];
    if (Object.keys(row).length) fixes[id] = row;
    else delete fixes[id];
  }
  const { error } = await createAdminClient().from("settings").upsert({ key: "staff_fixes", value: fixes as never, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw error;
  return fixes;
}
