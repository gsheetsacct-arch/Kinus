import { NAME_TAG_DIVISION } from "./master-sheet";

/**
 * Their registration details with the name-tag division set in Kinus (profiles.name_tag_division)
 * in place of the staff sheet's: null keeps the sheet's, "" takes it away (their Kinus division).
 */
export function withNameTagDivision(details: Record<string, string> | null, set: string | null | undefined): Record<string, string> | null {
  if (set === null || set === undefined) return details;
  const { [NAME_TAG_DIVISION]: _sheet, ...rest } = details ?? {};
  void _sheet;
  return set.trim() ? { ...rest, [NAME_TAG_DIVISION]: set.trim() } : rest;
}
