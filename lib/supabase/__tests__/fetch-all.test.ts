import { describe, expect, it } from "vitest";
import { fetchAll } from "../fetch-all";

const table = (n: number, cap: number) => {
  const rows = Array.from({ length: n }, (_, i) => i);
  const calls: [number, number][] = [];
  const build = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + cap)), error: null });
  };
  return { build, calls };
};

describe("fetchAll", () => {
  it("returns small results in one request", async () => {
    const t = table(37, 1000);
    expect(await fetchAll(t.build)).toHaveLength(37);
    expect(t.calls).toHaveLength(1);
  });
  it("reads every row of a big table without gaps or repeats", async () => {
    for (const n of [1000, 1001, 2999, 3000, 4500, 7001]) {
      const t = table(n, 1000);
      const got = await fetchAll(t.build);
      expect(got).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });
  it("copes with a server cap below the page size", async () => {
    const t = table(1234, 500);
    expect(await fetchAll(t.build)).toHaveLength(1234);
  });
  it("throws errors", async () => {
    await expect(fetchAll(() => Promise.resolve({ data: null, error: new Error("boom") }))).rejects.toThrow("boom");
  });
});
