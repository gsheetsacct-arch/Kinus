import type { Database } from "@/lib/supabase/database.types";

export type GlobalRole = Database["public"]["Enums"]["global_role"];
export type ScopeRole = Database["public"]["Enums"]["scope_role"];
export type AccessLevel = Database["public"]["Enums"]["access_level"];

export type Scope = {
  id: string;
  division_id: string;
  bunk_id: string | null;
  scope_role: ScopeRole;
  access_level: AccessLevel;
};

export type FieldVisibilityRow = {
  field_group: string;
  global_roles: GlobalRole[];
  scope_roles: ScopeRole[];
};

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: GlobalRole;
  scopes: Scope[];
};

export const LEVEL_RANK: Record<AccessLevel, number> = { view: 1, scan: 2, edit: 3 };

/** Mirrors `global_level()` in the database. */
export function globalLevel(role: GlobalRole): AccessLevel | null {
  switch (role) {
    case "owner":
    case "admin":
    case "director":
      return "edit";
    case "logistics":
      return "scan";
    case "office":
      return "view";
    default:
      return null;
  }
}

export const isAdmin = (u: CurrentUser) => u.role === "owner" || u.role === "admin";
export const isDirectorOrAbove = (u: CurrentUser) => isAdmin(u) || u.role === "director";
export const hasGlobalView = (u: CurrentUser) => globalLevel(u.role) !== null;

export function canAccessDivision(u: CurrentUser, divisionId: string, needed: AccessLevel): boolean {
  const g = globalLevel(u.role);
  if (g && LEVEL_RANK[g] >= LEVEL_RANK[needed]) return true;
  return u.scopes.some((s) => s.division_id === divisionId && LEVEL_RANK[s.access_level] >= LEVEL_RANK[needed]);
}

export function canAccessBunk(u: CurrentUser, divisionId: string, bunkId: string | null, needed: AccessLevel): boolean {
  const g = globalLevel(u.role);
  if (g && LEVEL_RANK[g] >= LEVEL_RANK[needed]) return true;
  return u.scopes.some(
    (s) =>
      s.division_id === divisionId &&
      (s.bunk_id === null || s.bunk_id === bunkId) &&
      LEVEL_RANK[s.access_level] >= LEVEL_RANK[needed],
  );
}

/** Division ids the user can see at all (null = everything). */
export function visibleDivisionIds(u: CurrentUser): string[] | null {
  if (hasGlobalView(u)) return null;
  return [...new Set(u.scopes.map((s) => s.division_id))];
}

/** The scope roles the user holds in a division (for field visibility and list presets). */
export function scopeRolesIn(u: CurrentUser, divisionId: string | null, bunkId: string | null): ScopeRole[] {
  return u.scopes
    .filter((s) => divisionId !== null && s.division_id === divisionId && (s.bunk_id === null || s.bunk_id === bunkId))
    .map((s) => s.scope_role);
}

/** Field groups this user may see for a camper in the given division/bunk. Mirrors `can_view_field_group()`. */
export function visibleFieldGroups(
  u: CurrentUser,
  rows: FieldVisibilityRow[],
  divisionId: string | null,
  bunkId: string | null,
): Set<string> {
  const roles = scopeRolesIn(u, divisionId, bunkId);
  const out = new Set<string>();
  for (const r of rows) {
    if (r.global_roles.includes(u.role) || roles.some((sr) => r.scope_roles.includes(sr))) out.add(r.field_group);
  }
  return out;
}

/** Which list-preset audiences this user may use. */
export function presetAudiencesFor(u: CurrentUser): string[] {
  if (isDirectorOrAbove(u)) return ["counselor", "head_counselor", "division_head", "director", "office", "custom"];
  if (u.role === "office" || u.role === "logistics") return ["office", "counselor", "head_counselor", "custom"];
  const roles = new Set(u.scopes.map((s) => s.scope_role));
  const out = new Set<string>(["custom"]);
  if (roles.has("division_head")) ["division_head", "head_counselor", "counselor"].forEach((a) => out.add(a));
  if (roles.has("head_counselor")) ["head_counselor", "counselor"].forEach((a) => out.add(a));
  if (roles.has("counselor") || roles.has("scanner")) out.add("counselor");
  return [...out];
}
