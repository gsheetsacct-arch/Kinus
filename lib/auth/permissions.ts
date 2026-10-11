import type { Database } from "@/lib/supabase/database.types";

export type StaffRole = Database["public"]["Enums"]["staff_role"];
export type AccessLevel = Database["public"]["Enums"]["access_level"];

/** One area row: a whole group, a whole division, or one bunk. */
export type Area = { id: string; group_id: string | null; division_id: string | null; bunk_id: string | null };

export type FieldVisibilityRow = { field_group: string; roles: StaffRole[] };

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: StaffRole;
  level: AccessLevel;
  allAreas: boolean;
  areas: Area[];
  /** Areas expanded to divisions (groups resolved), for quick checks. */
  coverage: { division_id: string; bunk_id: string | null }[];
};

export const LEVEL_RANK: Record<AccessLevel, number> = { view: 1, scan: 2, edit: 3 };
const ROLE_RANK: Record<StaffRole, number> = { owner: 9, director: 8, division_head: 6, head_counselor: 5, office: 4, logistics: 4, counselor: 3, scanner: 2 };

export const effectiveLevel = (u: CurrentUser): AccessLevel => (u.role === "owner" ? "edit" : u.level);
export const isOwner = (u: CurrentUser) => u.role === "owner";
/** Camp-wide setup (imports, sessions, settings, templates). */
export const isAdmin = (u: CurrentUser) => u.role === "owner" || (u.role === "director" && u.allAreas);
/** Directors of any area: staff for their area, bulk actions, corrections. */
export const isDirector = (u: CurrentUser) => u.role === "owner" || u.role === "director";
export const seesAllCamp = (u: CurrentUser) => u.role === "owner" || u.allAreas;
export const roleRank = (r: StaffRole) => ROLE_RANK[r];

export function canAccessBunk(u: CurrentUser, divisionId: string, bunkId: string | null, needed: AccessLevel): boolean {
  if (LEVEL_RANK[effectiveLevel(u)] < LEVEL_RANK[needed]) return false;
  if (seesAllCamp(u)) return true;
  return u.coverage.some((c) => c.division_id === divisionId && (c.bunk_id === null || c.bunk_id === bunkId));
}

/** Add a walk-in at the gate or desk: anyone who can edit campers somewhere (the division is checked too). */
export const canAddWalkIn = (u: CurrentUser) => isAdmin(u) || effectiveLevel(u) === "edit";

export function canAccessDivision(u: CurrentUser, divisionId: string, needed: AccessLevel): boolean {
  if (LEVEL_RANK[effectiveLevel(u)] < LEVEL_RANK[needed]) return false;
  return seesAllCamp(u) || u.coverage.some((c) => c.division_id === divisionId);
}

/** Division ids the user can see at all (null = everything). */
export function visibleDivisionIds(u: CurrentUser): string[] | null {
  if (seesAllCamp(u)) return null;
  return [...new Set(u.coverage.map((c) => c.division_id))];
}

/** Field groups this user's role may see (for campers they can see). Mirrors can_view_field_group(). */
export function visibleFieldGroups(u: CurrentUser, rows: FieldVisibilityRow[]): Set<string> {
  return new Set(rows.filter((r) => u.role === "owner" || r.roles.includes(u.role)).map((r) => r.field_group));
}

/** Which list-layout audiences this user may pick from. */
export function presetAudiencesFor(u: CurrentUser): string[] {
  switch (u.role) {
    case "owner":
    case "director":
      return ["counselor", "head_counselor", "division_head", "director", "office", "custom"];
    case "division_head":
      return ["division_head", "head_counselor", "counselor", "custom"];
    case "head_counselor":
      return ["head_counselor", "counselor", "custom"];
    case "office":
    case "logistics":
      return ["office", "counselor", "head_counselor", "custom"];
    default:
      return ["counselor", "custom"];
  }
}

/**
 * Whether `me` may give `areas` to someone: admins anything; area directors only
 * areas inside their own (a bunk/division of theirs, or one of their groups).
 */
export function canGrantAreas(
  me: CurrentUser,
  areas: { group_id: string | null; division_id: string | null; bunk_id: string | null }[],
  allAreas: boolean,
  divisionGroup: (divisionId: string) => string | null,
): boolean {
  if (isAdmin(me)) return true;
  if (!isDirector(me) || allAreas) return false;
  const myGroups = new Set(me.areas.map((a) => a.group_id).filter(Boolean));
  return areas.every((a) => {
    if (a.group_id) return myGroups.has(a.group_id);
    if (!a.division_id) return false;
    const g = divisionGroup(a.division_id);
    if (g && myGroups.has(g)) return true;
    return me.coverage.some((c) => c.division_id === a.division_id && (c.bunk_id === null || c.bunk_id === a.bunk_id));
  });
}

/** Area directors may manage people below director rank; admins anyone but owners (owners: anyone). */
export function canManageRole(me: CurrentUser, role: StaffRole): boolean {
  if (me.role === "owner") return true;
  if (isAdmin(me)) return role !== "owner";
  if (isDirector(me)) return roleRank(role) < roleRank("director");
  return false;
}

/** The print area (queue, batches, templates). Everyone else requests tags from a camper card. */
export const canUsePrintArea = (u: CurrentUser) => ["owner", "director", "division_head", "office", "logistics"].includes(u.role);

/** Following up on campers who haven't arrived: heads, directors and the office (not bunk counselors or check-in helpers). */
export const canFollowUp = (u: CurrentUser) => !["counselor", "scanner"].includes(u.role);
