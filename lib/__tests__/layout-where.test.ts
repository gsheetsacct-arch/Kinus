import { describe, expect, it } from "vitest";
import { parseWhere } from "../list-where";

describe("a layout's filters", () => {
  it("reads filters on any field", () => {
    expect(parseWhere({ where: [{ key: "grade", values: ["4", "5"] }, { key: "source.ppa.shirt", values: ["(any)"] }] })).toEqual([
      { key: "grade", values: ["4", "5"] },
      { key: "source.ppa.shirt", values: ["(any)"] },
    ]);
  });
  it("reads filters saved before (an export column) as that column", () => {
    expect(parseWhere({ where: [{ column: "ppa.sleeping", values: ["Yes"] }] })).toEqual([{ key: "source.ppa.sleeping", values: ["Yes"] }]);
  });
  it("drops a filter with no answers", () => {
    expect(parseWhere({ where: [{ key: "grade", values: [] }] })).toEqual([]);
  });
});

describe("has anything", () => {
  it("a real answer", async () => {
    const { hasContent } = await import("../list-where");
    for (const v of ["Peanuts", "4", "M", "No", "בוטנים", "Yes"]) expect(hasContent(v)).toBe(true);
  });
  it("nothing that only looks like something", async () => {
    const { hasContent } = await import("../list-where");
    for (const v of ["", "  ", "‏", "​ ", "-", ".", "N/A", "n/a", "NA", "None", "none.", "nothing", "--"]) expect(hasContent(v)).toBe(false);
  });
});
