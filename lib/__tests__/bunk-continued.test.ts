import { describe, expect, it } from "vitest";
import { continuedBunkNumbers } from "../print/bunk-continued";

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
