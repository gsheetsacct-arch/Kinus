/**
 * A read or write over many ids, a few hundred at a time: ids go in the request's address,
 * and a check-in's worth of labels (thousands of requests) would make it too long. The
 * chunks run side by side, and their rows come back together.
 */
export async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown } | T[]>, size = 150): Promise<T[]> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size));
  const parts = await Promise.all(
    chunks.map(async (c) => {
      const r = await run(c);
      if (Array.isArray(r)) return r;
      if (r.error) throw r.error;
      return r.data ?? [];
    }),
  );
  return parts.flat();
}
