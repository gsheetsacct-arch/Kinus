import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AccessLevel, StaffRole } from "@/lib/auth/permissions";
import { ACCESS_LEVELS, FIELD_GROUPS, STAFF_ROLES } from "@/lib/labels";

type DB = SupabaseClient<Database>;
export type RoleSetup = { levels: Record<StaffRole, AccessLevel>; sees: Record<StaffRole, string[]> };

/** What each role can do (its level) and which sensitive details it sees: set on Staff → Roles. */
export async function loadRoles(db: DB): Promise<RoleSetup> {
  const [{ data: access }, { data: fv }] = await Promise.all([db.from("role_access").select("role, access_level"), db.from("field_visibility").select("field_group, roles")]);
  const roles = Object.keys(STAFF_ROLES) as StaffRole[];
  const levels = Object.fromEntries(roles.map((r) => [r, r === "owner" ? "edit" : (access?.find((a) => a.role === r)?.access_level ?? STAFF_ROLES[r].defaultLevel)])) as Record<StaffRole, AccessLevel>;
  const order = Object.keys(FIELD_GROUPS);
  const sees = Object.fromEntries(roles.map((r) => [r, r === "owner" ? order : order.filter((g) => fv?.some((f) => f.field_group === g && f.roles.includes(r)))])) as Record<StaffRole, string[]>;
  return { levels, sees };
}

/** "Check in & out · sees contacts and medical details" for the role picker. */
export function roleSummary(setup: RoleSetup, role: StaffRole): string {
  if (role === "owner") return "Everything, everywhere";
  const seen = setup.sees[role].map((g) => FIELD_GROUPS[g]?.short ?? g);
  return `${ACCESS_LEVELS[setup.levels[role]].label} · ${seen.length ? `sees ${seen.join(", ")}` : "no contact or medical details"}`;
}
