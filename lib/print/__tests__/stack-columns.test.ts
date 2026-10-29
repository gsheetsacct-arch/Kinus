import { describe, expect, it } from "vitest";
import { stackColumns } from "../render";

const grid = (xs: (string | null)[], cols: number) => Array.from({ length: Math.ceil(xs.length / cols) }, (_, r) => xs.slice(r * cols, r * cols + cols).map((x) => x ?? "·").join(" "));

describe("stackColumns", () => {
  it("puts two copies of each camper one over the other", () => {
    expect(grid(stackColumns(["A", "A", "B", "B", "C", "C", "D", "D", "E", "E", "F", "F"], 3, 2), 3)).toEqual(["A B C", "A B C", "D E F", "D E F"]);
  });
  it("three copies down a column", () => {
    expect(grid(stackColumns(["A", "A", "A", "B", "B", "B"], 2, 3), 2)).toEqual(["A B", "A B", "A B"]);
  });
  it("one copy each: unchanged", () => {
    const s = ["A", "B", "C", "D"];
    expect(stackColumns(s, 2, 1)).toEqual(s);
  });
  it("fills the same labels on a part-used sheet (only the order moves)", () => {
    const s = [null, "A", "A", "B", "B", "C", "C", null, null];
    const out = stackColumns(s, 3, 2);
    expect(out.map((x) => x === null)).toEqual(s.map((x) => x === null));
    expect([...out].filter(Boolean).sort()).toEqual(["A", "A", "B", "B", "C", "C"]);
  });
  it("a short last sheet keeps its labels in place", () => {
    const s = ["A", "A", "B", "B", "C"];
    expect(stackColumns(s, 3, 2).filter(Boolean).length).toBe(5);
    expect(grid(stackColumns(s, 3, 2), 3)).toEqual(["A B C", "A B"]);
  });
  it("puts copies across when they fill whole rows (3 on a 3-across sheet)", () => {
    expect(grid(stackColumns(["A", "A", "A", "B", "B", "B"], 3, 3), 3)).toEqual(["A A A", "B B B"]);
    expect(grid(stackColumns(["A", "A", "B", "B"], 4, 2), 4)).toEqual(["A A B B"]);
  });
});
