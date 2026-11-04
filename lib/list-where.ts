/** A layout filter: any field (a Kinus field, "source.<export column>", Sleeping) and the answers that pass. */
export type ColumnFilter = { key: string; values: string[] };
/** The answers a filter can have besides real ones: nothing in it, or anything. */
export const WHERE_EMPTY = "(empty)";
export const WHERE_ANY = "(any)";

/**
 * The layout's filters, as saved ({ where: [{ key, values }] }); filters saved before any field
 * could be one ({ column }: an export column) read as that column.
 */
export function parseWhere(filters: unknown): ColumnFilter[] {
  const w = (filters as { where?: unknown } | null)?.where;
  if (!Array.isArray(w)) return [];
  return w
    .map((x: { key?: unknown; column?: unknown; values?: unknown }) => ({
      key: typeof x?.key === "string" ? x.key : typeof x?.column === "string" && x.column ? `source.${x.column}` : "",
      values: Array.isArray(x?.values) ? x.values.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean) : [],
    }))
    .filter((x) => x.key && x.values.length)
    .slice(0, 10);
}
