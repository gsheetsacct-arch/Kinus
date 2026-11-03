/**
 * Extra fields: export columns Kinus has no field of its own for ("ppa.sleeping_at_the_kinus"),
 * chosen on the import's column step to show on the camper page, in lists and on labels.
 * Every column of the file is kept with each camper anyway; this only decides what's shown.
 * Stored in settings.extra_fields as [{ column, label }].
 */
export type ExtraField = {
  column: string;
  label: string;
  /** Shorter wording for long answers, for the camper page and lists: { "Yes, at the Kinus (In the …)": "Sleeping here" }. */
  answers?: Record<string, string>;
  /** Answers that say nothing special ("No", "None"): shown as nothing at all. */
  hide?: string[];
  /**
   * Who sees it: a detail group (medical, contacts, family…, set per role on Staff → Roles), or
   * "basic" for everyone. Unset: guessed from the column's name (medical-looking is medical…).
   */
  group?: ExtraGroup;
};

/** The groups an added column can be put in ("basic": everyone who sees the camper). */
export const EXTRA_GROUPS = ["basic", "medical", "contacts", "address", "parent_notes", "staff_notes", "family"] as const;
export type ExtraGroup = (typeof EXTRA_GROUPS)[number];
const isExtraGroup = (g: unknown): g is ExtraGroup => typeof g === "string" && (EXTRA_GROUPS as readonly string[]).includes(g);

/** column key → the group chosen for it, for groupOfKey. */
export const chosenGroups = (fields: Pick<ExtraField, "column" | "group">[]): Map<string, ExtraGroup> =>
  new Map(fields.filter((f) => f.group).map((f) => [columnKey(f.column), f.group!]));

/** "ppa#sleeping_at_the_kinus" and "ppa.sleeping_at_the_kinus" are the same column. */
export const columnKey = (k: string) => k.trim().toLowerCase().replace(/#/g, ".");

/** "ppa.sleeping_at_the_kinus" → "Sleeping at the kinus". */
export function humanLabel(column: string): string {
  const last = column.split(/[.#]/).pop() ?? column;
  const words = last.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : column;
}

export function parseExtraFields(value: unknown): ExtraField[] {
  if (!Array.isArray(value)) return [];
  const fields = value
    .filter((x): x is ExtraField => Boolean(x && typeof x.column === "string" && typeof x.label === "string"))
    .map((f) => ({
      column: f.column,
      label: f.label,
      ...(f.answers && typeof f.answers === "object" && !Array.isArray(f.answers) ? { answers: f.answers } : {}),
      ...(Array.isArray(f.hide) && f.hide.length ? { hide: f.hide.filter((x): x is string => typeof x === "string") } : {}),
      ...(isExtraGroup(f.group) ? { group: f.group } : {}),
    }));
  return oneOfEachColumn(fields, (f) => f.column);
}

const same = (a: string) => a.replace(/\s+/g, " ").trim().toLowerCase();

/** The short answer set for this value, else the value as it is; "" for an answer set to Hide. */
export function shortAnswer(field: Pick<ExtraField, "answers" | "hide">, value: string): string {
  if (!value) return value;
  const want = same(value);
  if (field.hide?.some((h) => same(h) === want)) return "";
  if (!field.answers) return value;
  for (const [long, short] of Object.entries(field.answers)) if (short.trim() && same(long) === want) return short.trim();
  return value;
}

/** The camper's value for an extra field, from their row in the latest import. */
export function extraValue(sourceData: unknown, column: string): string {
  const data = (sourceData ?? {}) as Record<string, unknown>;
  const want = columnKey(column);
  for (const [k, v] of Object.entries(data)) if (columnKey(k) === want) return v === null || v === undefined ? "" : String(v).trim();
  return "";
}

/**
 * One of each column, for showing: drops a "family.city (2)" copy when "family.city" is there
 * (kept that way for a while from exports that repeat a column) and the same column spelled
 * twice ("Family.City", "family#city"). The first one listed stays.
 */
export function oneOfEachColumn<T>(items: T[], column: (item: T) => string): T[] {
  const key = (c: string) => columnKey(c).replace(/\s+/g, " ");
  const all = new Set(items.map((i) => key(column(i))));
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = key(column(i));
    const base = k.replace(/ \(\d+\)$/, "");
    if (base !== k && all.has(base)) return false;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
