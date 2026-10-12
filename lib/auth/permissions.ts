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
/** Who runs a Staff page: directors, and division heads and head counselors for the staff of their own divisions. */
export const isStaffManager = (u: CurrentUser) => isDirector(u) || u.role === "division_head" || u.role === "head_counselor";
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
  // area directors, division heads and head counselors: only inside their own part, never all of camp
  if (!isStaffManager(me) || allAreas) return false;
  const myGroups = new Set(me.areas.map((a) => a.group_id).filter(Boolean));
  return areas.every((a) => {
    if (a.group_id) return myGroups.has(a.group_id);
    if (!a.division_id) return false;
    const g = divisionGroup(a.division_id);
    if (g && myGroups.has(g)) return true;
    return me.coverage.some((c) => c.division_id === a.division_id && (c.bunk_id === null || c.bunk_id === a.bunk_id));
  });
}

/**
 * Who may manage whom: owners anyone; directors over all of camp anyone but owners; area
 * directors anyone below director; a division head their head counselors, counselors and
 * check-in helpers; a head counselor their counselors and check-in helpers.
 */
export function canManageRole(me: CurrentUser, role: StaffRole): boolean {
  if (me.role === "owner") return true;
  if (isAdmin(me)) return role !== "owner";
  if (isDirector(me)) return roleRank(role) < roleRank("director");
  if (me.role === "division_head") return role === "head_counselor" || role === "counselor" || role === "scanner";
  if (me.role === "head_counselor") return role === "counselor" || role === "scanner";
  return false;
}

/** Directors give any level; division heads and head counselors at most their own. */
export const canGrantLevel = (me: CurrentUser, level: AccessLevel) => isDirector(me) || LEVEL_RANK[level] <= LEVEL_RANK[effectiveLevel(me)];

/** The print area (queue, batches, templates). Everyone else requests tags from a camper card. */
export const canUsePrintArea = (u: CurrentUser) => ["owner", "director", "division_head", "office", "logistics"].includes(u.role);

/** The staff phone book: everyone. Counselors and check-in helpers see their own head staff; head staff and the office see all their divisions' staff. */
export const canUsePhoneBook = (u: CurrentUser) => Boolean(u.role);
/** A short phone book: just the head counselors and division heads of their division. */
export const phoneBookHeadsOnly = (u: CurrentUser) => u.role === "counselor" || u.role === "scanner";

/** Following up on campers who haven't arrived: heads, directors and the office (not bunk counselors or check-in helpers). */
export const canFollowUp = (u: CurrentUser) => !["counselor", "scanner"].includes(u.role);
