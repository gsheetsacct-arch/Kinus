import { describe, expect, it } from "vitest";
import { continuedBunkNumbers, continuedDivisionNumbers } from "../print/bunk-continued";

describe("continuedBunkNumbers", () => {
  it("carries each camp's numbers on after the camp before it", () => {
    const american = [
      { id: "a1", name: "Bunk Alef" },
      { id: "a65", name: "Bunk סה" },
      { id: "a27", name: "Bunk כז" },
    ];
    const french = [
      { id: "f1", name: "Bunk א French" },
      { id: "f6", name: "Bunk ו French" },
    ];
    const hebrew = [
      { id: "h1", name: "Bunk א עברית" },
      { id: "h10", name: "Bunk י עברית" },
      { id: "none", name: "Office" },
    ];
    const n = continuedBunkNumbers([american, french, hebrew]);
    expect(Object.fromEntries(n)).toEqual({ a1: 1, a65: 65, a27: 27, f1: 66, f6: 71, h1: 72, h10: 81 });
  });
});

describe("continuedDivisionNumbers", () => {
  it("numbers the divisions one by one after the last bunk number", () => {
    const n = continuedDivisionNumbers([
      [
        { id: "d1", bunks: [{ id: "a1", name: "Bunk Alef" }, { id: "a65", name: "Bunk סה" }] },
        { id: "d2", bunks: [] },
      ],
      [{ id: "d3", bunks: [{ id: "f6", name: "Bunk ו French" }, { id: "none", name: "Office" }] }],
    ]);
    expect(Object.fromEntries(n)).toEqual({ d1: 72, d2: 73, d3: 74 });
  });
});
