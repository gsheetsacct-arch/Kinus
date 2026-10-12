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
};

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
  return value
    .filter((x): x is ExtraField => Boolean(x && typeof x.column === "string" && typeof x.label === "string"))
    .map((f) => ({ column: f.column, label: f.label, ...(f.answers && typeof f.answers === "object" && !Array.isArray(f.answers) ? { answers: f.answers } : {}) }));
}

const same = (a: string) => a.replace(/\s+/g, " ").trim().toLowerCase();

/** The short answer set for this value, else the value as it is. */
export function shortAnswer(field: Pick<ExtraField, "answers">, value: string): string {
  if (!value || !field.answers) return value;
  const want = same(value);
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
