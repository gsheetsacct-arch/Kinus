/**
 * More than one registration export in a session: the main one (American, French and Hebrew
 * together, divisions from the file) and a separate program's (a virtual program: its own
 * export, with no division column). Each kind of export keeps its own column setup
 * (import_mappings, found by its columns), and a separate program's setup says which
 * division everyone in it goes into (`fixedDivision`).
 *
 * The two never mix: a program's registration ids are kept apart (stored as
 * "virtual:1234", shown as "1234"), so one numbered 1, 2, 3… in its own system can't be
 * matched to a main-camp camper with the same number; and each import matches only its own
 * campers, by id or by name.
 */

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** "Virtual" → "virtual:", "Virtual Program 2" → "virtual-program-2:". */
export function idPrefix(division: string): string {
  const slug = division
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "program"}:`;
}

/** A registration id as people know it (without its program's prefix). */
export function displaySourceId(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.replace(/^[a-z0-9-]+:(?=.)/, "");
}

/** Everyone in a separate program's file: into its division, with ids of its own. */
export function intoProgram<T extends { division_name: string | null; source_id: string | null }>(parsed: T, division: string): T {
  const prefix = idPrefix(division);
  const id = parsed.source_id?.trim();
  return { ...parsed, division_name: division, source_id: id ? (id.startsWith(prefix) ? id : prefix + id) : null };
}

/**
 * The campers an import may match: a separate program's file only its own division's; the
 * main export everyone except the separate programs'.
 */
export function campersForImport<T extends { division_name: string | null }>(existing: T[], fixedDivision: string | null | undefined, programDivisions: string[]): T[] {
  if (fixedDivision) return existing.filter((e) => same(e.division_name, fixedDivision));
  return existing.filter((e) => !programDivisions.some((d) => same(d, e.division_name)));
}

/**
 * How well a remembered column setup fits a file: the share of columns they have in common
 * (of the two together), so a file picks the setup made for exactly its kind of export even
 * when two exports share many columns. A setup saved before setups knew their columns only
 * knows the columns it matched: then the share of the file's columns it knows, just under a
 * full match.
 */
export function layoutFit(fileHeaders: string[], layout: { headers?: string[]; mapped: string[] }): number {
  if (!fileHeaders.length) return 0;
  const key = (h: string) => h.trim().toLowerCase().replace(/#/g, ".").replace(/\s+/g, " ");
  const file = new Set(fileHeaders.map(key));
  if (layout.headers?.length) {
    const theirs = new Set(layout.headers.map(key));
    const both = [...file].filter((h) => theirs.has(h)).length;
    return both / new Set([...file, ...theirs]).size;
  }
  const known = new Set(layout.mapped.map(key));
  return Math.min(0.99, [...file].filter((h) => known.has(h)).length / file.size);
}

/** A setup counts as this file's when at least half of the columns match. */
export const LAYOUT_FIT = 0.5;
