import type { ParsedCamper } from "./mapping";
import { idPrefix } from "./programs";
import { readGroups } from "./groups";

/**
 * The Thursday Program: regular campers who also come on Thursday. The registration export
 * says so in three columns:
 *   ppa.thursday_program_yes_no   Yes / No (כן / לא)
 *   group_types.thursday          "Thursday Program - English" / "- French" / "- Hebrew"
 *   group_types.thursday_bunks    their Thursday bunk (often empty)
 *
 * Each camper with a Thursday group is listed twice: in their regular division (as ever) and
 * again in that Thursday division, which sits in a camp of its own ("Thursday American",
 * "Thursday French", "Thursday Hebrew") and prints with the regular camp's templates. The
 * Thursday record has its own registration id ("thursday:1234", shown as 1234), so the two are
 * never mixed up; dropping out of Thursday marks only the Thursday one missing.
 */

export const THURSDAY_PREFIX = idPrefix("Thursday");
export const THURSDAY_ROW_OFFSET = 1_000_000;

const COLUMNS = { yesNo: "ppa.thursday_program_yes_no", group: "group_types.thursday", bunk: "group_types.thursday_bunks" };
const NO = /^(no|n|false|non|לא)$/i;
const YES = /^(yes|y|true|oui|כן)$/i;

/** "Thursday Program - English" → the camp it's in, by the regular camp's name. */
const LANGUAGE_CAMP: [RegExp, string][] = [
  [/english|american/i, "American"],
  [/french|français|francais/i, "French"],
  [/hebrew|עברית|ivrit/i, "Hebrew"],
];

/** The Thursday camp for a Thursday division ("Thursday Program - French" → "Thursday French"); null: not one. */
export function thursdayCamp(division: string): string | null {
  const regular = LANGUAGE_CAMP.find(([re]) => re.test(division))?.[1];
  return regular ? `Thursday ${regular}` : null;
}

/** The regular camp a Thursday camp prints with ("Thursday American" → "American"). */
export const regularCampOf = (camp: string) => camp.replace(/^thursday\s+/i, "");

const cell = (raw: Record<string, string>, column: string) => {
  const want = column.toLowerCase();
  const key = Object.keys(raw).find((k) => k.trim().toLowerCase() === want);
  return key ? String(raw[key] ?? "").trim() : "";
};

/** Whether a file has the Thursday columns at all. */
export const hasThursdayColumns = (headers: string[]) => headers.some((h) => h.trim().toLowerCase() === COLUMNS.group);

const REGULAR_BUNKS = ["group_types.bunks", "group_types.hebrew_bunks", "group_types.french_bunks"];
/**
 * A file just for the Thursday Program (its bunks: "group_types.thursday_bunks", with the ids
 * and names, but none of the regular bunk columns): every row is a camper's Thursday record,
 * never their regular one, and only what the file has changes.
 */
export const isThursdayOnlyFile = (headers: string[]) => {
  const h = headers.map((x) => x.trim().toLowerCase());
  return (h.includes(COLUMNS.bunk) || h.includes(COLUMNS.group)) && !REGULAR_BUNKS.some((b) => h.includes(b));
};

/** In a Thursday-only file: the row's Thursday group (if the file has it) and bunk. */
export const thursdayCells = (raw: Record<string, string>) => ({ group: cell(raw, COLUMNS.group) || null, bunk: cell(raw, COLUMNS.bunk) || null });

export type ThursdayPick = { division: string; bunk: string | null } | { skip: string } | null;

/**
 * Where a row's camper goes on Thursday: their Thursday group (division) and bunk; a reason
 * it's left out (the group says Thursday but they answered No, or they answered Yes with no
 * group yet); or null (not in the program).
 */
export function thursdayOf(raw: Record<string, string>, groupsColumn?: string): ThursdayPick {
  // the registration's one list of groups (students.group), when the file has it, says who's in
  // the Thursday Program and which one; their Thursday bunk is still its own column
  if (groupsColumn) {
    const g = readGroups(raw[groupsColumn]);
    return g.thursday ? { division: g.thursday, bunk: cell(raw, COLUMNS.bunk) || null } : null;
  }
  const group = cell(raw, COLUMNS.group);
  const said = cell(raw, COLUMNS.yesNo);
  if (!group) return YES.test(said) ? { skip: `answered ${said} to the Thursday Program, but has no Thursday group in the export yet, so isn't in it` } : null;
  if (NO.test(said)) return { skip: `has the Thursday group "${group}" but answered ${said} to the Thursday Program, so isn't in it` };
  return { division: group, bunk: cell(raw, COLUMNS.bunk) || null };
}

/** A Thursday bunk as the export gives it: "3" is "Bunk 3", like every other bunk. */
export const thursdayBunk = (v: string | null) => (v ? (/^\d+$/.test(v.trim()) ? `Bunk ${v.trim()}` : v.trim()) : null);

/** A camper's Thursday record: the same details, in the Thursday division, with its own id. */
export function thursdayCopy(parsed: ParsedCamper, pick: { division: string; bunk: string | null }): ParsedCamper {
  const id = parsed.source_id?.trim();
  return {
    ...parsed,
    source_id: id ? (id.startsWith(THURSDAY_PREFIX) ? id : THURSDAY_PREFIX + id) : null,
    division_name: pick.division,
    bunk_name: thursdayBunk(pick.bunk),
    division_candidates: [pick.division],
    bunk_candidates: pick.bunk ? [thursdayBunk(pick.bunk)!] : [],
    contacts: parsed.contacts.map((c) => ({ ...c })),
    source_data: { ...parsed.source_data },
    warnings: [`Thursday Program: a second record for Thursday (${pick.division}), next to their regular one.`],
  };
}
