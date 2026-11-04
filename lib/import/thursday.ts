import type { ParsedCamper } from "./mapping";
import { idPrefix } from "./programs";
import { normalizeName } from "./normalize";

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

/**
 * A column's name, however it's written: "group_types.thursday_bunks" (the registration export)
 * and "Thursday bunks" (a list exported from Kinus) are the same column.
 */
const columnName = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/^group_types\./, "")
    .replace(/[._\s-]+/g, " ")
    .trim();
const isColumn = (h: string, column: string) => columnName(h) === columnName(column);

const cell = (raw: Record<string, string>, column: string) => {
  const key = Object.keys(raw).find((k) => isColumn(k, column));
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
  const hasThursday = headers.some((x) => isColumn(x, COLUMNS.bunk)) || h.includes(COLUMNS.group);
  return hasThursday && !REGULAR_BUNKS.some((b) => h.includes(b));
};

/** In a Thursday-only file: the row's Thursday group (if the file has it) and bunk. */
export const thursdayCells = (raw: Record<string, string>) => ({ group: cell(raw, COLUMNS.group) || null, bunk: cell(raw, COLUMNS.bunk) || null });

export type ThursdayPick = { division: string; bunk: string | null } | { skip: string } | null;

/**
 * Where a row's camper goes on Thursday: their Thursday group (division) and bunk; a reason
 * it's left out (the group says Thursday but they answered No, or they answered Yes with no
 * group yet); or null (not in the program).
 */
export function thursdayOf(raw: Record<string, string>): ThursdayPick {
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

/**
 * In a Thursday-only file, the Thursday record a row is about: by its registration id, or, when
 * the file has none (a list exported from Kinus), by name among the Thursday records (in the
 * file's Thursday group, if it says). Null: nobody in the Thursday Program; skip: can't tell who.
 */
export function thursdayRecordFor(
  parsed: { source_id: string | null; first_name: string; last_name: string },
  group: string | null,
  thursday: { source_id: string | null; first_name: string; last_name: string; division_name: string | null }[],
): { id: string; division: string | null } | { skip: string } | null {
  const id = parsed.source_id?.trim().replace(THURSDAY_PREFIX, "");
  if (id) {
    const rec = thursday.find((e) => e.source_id === THURSDAY_PREFIX + id);
    return rec ? { id, division: rec.division_name } : null;
  }
  const name = normalizeName(`${parsed.first_name} ${parsed.last_name}`);
  if (!name) return null;
  let same = thursday.filter((e) => e.source_id && normalizeName(`${e.first_name} ${e.last_name}`) === name);
  if (group && same.length > 1) same = same.filter((e) => (e.division_name ?? "").toLowerCase() === group.toLowerCase());
  if (!same.length) return null;
  if (same.length > 1) return { skip: `${same.length} campers in the Thursday Program have this name (${same.map((e) => e.division_name ?? "?").join(", ")}): add their registration ID to the file to tell them apart` };
  return { id: same[0].source_id!.slice(THURSDAY_PREFIX.length), division: same[0].division_name };
}
