import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/auth/permissions";

/**
 * A person as the app sees them, by id, for requests that don't come with a sign-in (the
 * design connector: its link stands for the person who made it). Null when they can't use
 * Kinus any more (inactive, no sign-in of their own).
 */
export async function loadUserById(id: string): Promise<CurrentUser | null> {
  const admin = createAdminClient();
  const [{ data: profile }, { data: areas }] = await Promise.all([
    admin.from("profiles").select("id, email, full_name, role, access_level, all_areas, is_active, login").eq("id", id).maybeSingle(),
    admin.from("staff_scopes").select("id, group_id, division_id, bunk_id").eq("user_id", id),
  ]);
  if (!profile || !profile.is_active || profile.login !== "personal") return null;
  const rows = areas ?? [];
  const groupIds = rows.map((a) => a.group_id).filter((x): x is string => Boolean(x));
  const grouped = groupIds.length ? ((await admin.from("divisions").select("id, group_id").in("group_id", groupIds)).data ?? []) : [];
  return {
    id: profile.id,
    email: profile.email ?? "",
    fullName: profile.full_name,
    role: profile.role,
    level: profile.access_level,
    allAreas: profile.all_areas,
    areas: rows,
    coverage: [...rows.filter((a) => a.division_id).map((a) => ({ division_id: a.division_id!, bunk_id: a.bunk_id })), ...grouped.map((d) => ({ division_id: d.id, bunk_id: null }))],
    checkinLogin: false,
  };
}
