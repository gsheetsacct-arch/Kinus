import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AccessLevel, StaffRole } from "@/lib/auth/permissions";
import { ACCESS_LEVELS, FIELD_GROUPS, STAFF_ROLES } from "@/lib/labels";

type DB = SupabaseClient<Database>;
export type RoleSetup = { levels: Record<StaffRole, AccessLevel>; sees: Record<StaffRole, string[]>; inUse: Record<StaffRole, boolean> };

/** Owner and Director can't be removed: someone has to run Kinus. */
export const KEPT_ROLES: StaffRole[] = ["owner", "director"];

/** What each role can do (its level) and which sensitive details it sees: set on Staff → Roles. */
export async function loadRoles(db: DB): Promise<RoleSetup> {
  const [{ data: access }, { data: fv }] = await Promise.all([db.from("role_access").select("role, access_level, enabled"), db.from("field_visibility").select("field_group, roles")]);
  const roles = Object.keys(STAFF_ROLES) as StaffRole[];
  const levels = Object.fromEntries(roles.map((r) => [r, r === "owner" ? "edit" : (access?.find((a) => a.role === r)?.access_level ?? STAFF_ROLES[r].defaultLevel)])) as Record<StaffRole, AccessLevel>;
  const order = Object.keys(FIELD_GROUPS);
  const sees = Object.fromEntries(roles.map((r) => [r, r === "owner" ? order : order.filter((g) => fv?.some((f) => f.field_group === g && f.roles.includes(r)))])) as Record<StaffRole, string[]>;
  const inUse = Object.fromEntries(roles.map((r) => [r, KEPT_ROLES.includes(r) || (access?.find((a) => a.role === r)?.enabled ?? true)])) as Record<StaffRole, boolean>;
  return { levels, sees, inUse };
}

/** The roles that can be given: removed ones are left out, except the one a person already has. */
export function rolesInUse(setup: RoleSetup, roles: StaffRole[], keep?: StaffRole): StaffRole[] {
  return roles.filter((r) => setup.inUse[r] || r === keep);
}

/** "Check in & out · sees contacts and medical details" for the role picker. */
export function roleSummary(setup: RoleSetup, role: StaffRole): string {
  if (role === "owner") return "Everything, everywhere";
  const seen = setup.sees[role].map((g) => FIELD_GROUPS[g]?.short ?? g);
  return `${ACCESS_LEVELS[setup.levels[role]].label} · ${seen.length ? `sees ${seen.join(", ")}` : "no contact or medical details"}`;
}
