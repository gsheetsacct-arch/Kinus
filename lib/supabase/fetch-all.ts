/**
 * Supabase (PostgREST) returns at most 1,000 rows per request by default, silently.
 * Any read that can exceed that (campers, contacts, import rows) must page through it.
 *
 * `build(from, to)` must return the same query each time with `.range(from, to)` applied
 * and a deterministic `.order(...)`, so pages don't overlap or skip rows.
 */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    out.push(...page);
    // Advance by what actually came back: works even if the server's cap is below pageSize.
    if (page.length === 0) break;
    from += page.length;
  }
  return out;
}
