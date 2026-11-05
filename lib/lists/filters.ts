/**
 * The Lists page's column filters: up to MAX_LIST_FILTERS, each a column of the list and an
 * answer ("has anything", "empty", or one answer), all of them (and) or any one (or). In the
 * address: fcol/fval, fcol2/fval2… and fmatch=any (default: all).
 */
export const MAX_LIST_FILTERS = 4;
export type ListFilter = { key: string; value: string };
export type FilterMatch = "all" | "any";
export const FILTER_ANY_VALUE = "__any";

const suffix = (i: number) => (i === 0 ? "" : String(i + 1));

/** The filters in the address, in order, without empty ones (so a cleared first filter moves the others up). */
export function parseListFilters(get: (name: string) => string | null | undefined): { filters: ListFilter[]; match: FilterMatch } {
  const filters: ListFilter[] = [];
  for (let i = 0; i < MAX_LIST_FILTERS; i++) {
    const key = get(`fcol${suffix(i)}`);
    if (!key) continue;
    const value = get(`fval${suffix(i)}`);
    filters.push({ key: String(key).slice(0, 210), value: value ? String(value).slice(0, 300) : FILTER_ANY_VALUE });
  }
  return { filters, match: get("fmatch") === "any" ? "any" : "all" };
}

/** Back into the address (for the download links). */
export function listFiltersQuery(filters: ListFilter[], match: FilterMatch): Record<string, string> {
  const out: Record<string, string> = {};
  filters.slice(0, MAX_LIST_FILTERS).forEach((f, i) => {
    out[`fcol${suffix(i)}`] = f.key;
    out[`fval${suffix(i)}`] = f.value;
  });
  if (filters.length > 1 && match === "any") out.fmatch = "any";
  return out;
}

/** The form fields' names for filter i (0-based). */
export const filterFieldNames = (i: number) => ({ col: `fcol${suffix(i)}`, val: `fval${suffix(i)}` });
