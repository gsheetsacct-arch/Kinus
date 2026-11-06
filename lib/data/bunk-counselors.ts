import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES } from "@/lib/labels";

export type BunkCounselor = { id: string; name: string; role: string; phone: string | null };

/**
 * The staff a bunk has (its counselors: everyone given that bunk on Staff), for the camper page,
 * to call them. Active people only, check-in logins left out; counselors first, then by name.
 */
export async function bunkCounselors(bunkId: string | null | undefined): Promise<BunkCounselor[]> {
  if (!bunkId) return [];
  const admin = createAdminClient();
  const { data: scopes } = await admin.from("staff_scopes").select("user_id").eq("bunk_id", bunkId);
  const ids = [...new Set((scopes ?? []).map((s) => s.user_id))];
  if (!ids.length) return [];
  const { data: people } = await admin.from("profiles").select("id, full_name, role, phone").in("id", ids).eq("is_active", true).neq("login", "shared");
  return [...(people ?? [])]
    .sort((a, b) => Number(b.role === "counselor") - Number(a.role === "counselor") || a.full_name.localeCompare(b.full_name))
    .map((p) => ({ id: p.id, name: p.full_name, role: STAFF_ROLES[p.role as keyof typeof STAFF_ROLES]?.label ?? p.role, phone: p.phone?.trim() || null }));
}
