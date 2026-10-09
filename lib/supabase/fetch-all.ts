/**
 * Supabase (PostgREST) returns at most 1,000 rows per request by default, silently.
 * Any read that can exceed that (campers, contacts, import rows) must page through it.
 *
 * `build(from, to)` must return the same query each time with `.range(from, to)` applied
 * and a deterministic `.order(...)`, so pages don't overlap or skip rows.
 *
 * After a full first page, the next few pages are requested together: each round trip to
 * the database costs the same whether it brings back rows or none.
 */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, pageSize = 1000, ahead = 3): Promise<T[]> {
  const first = await build(0, pageSize - 1);
  if (first.error) throw first.error;
  const out: T[] = [...(first.data ?? [])];
  // The server's cap may be below pageSize (it is a round number): then page by what came back.
  const step = out.length;
  if (step === 0 || (step < pageSize && step % 100 !== 0)) return out;
  for (let from = step; ; from += step * ahead) {
    const pages = await Promise.all(Array.from({ length: ahead }, (_, i) => build(from + i * step, from + (i + 1) * step - 1)));
    for (const p of pages) {
      if (p.error) throw p.error;
      out.push(...(p.data ?? []));
    }
    if (pages.some((p) => (p.data ?? []).length < step)) return out;
  }
}
