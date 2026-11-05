import { describe, expect, it } from "vitest";
import { listFiltersQuery, parseListFilters } from "../filters";

describe("the Lists page's filters", () => {
  it("reads several, in order, skipping cleared ones", () => {
    const sp: Record<string, string> = { fcol: "", fval: "x", fcol2: "grade", fval2: "4", fcol3: "tshirt", fmatch: "any" };
    expect(parseListFilters((k) => sp[k])).toEqual({ filters: [{ key: "grade", value: "4" }, { key: "tshirt", value: "__any" }], match: "any" });
  });
  it("is all of them by default, and goes back into the address", () => {
    const f = [{ key: "grade", value: "4" }, { key: "bunk", value: "__none" }];
    expect(parseListFilters(() => null).match).toBe("all");
    expect(listFiltersQuery(f, "any")).toEqual({ fcol: "grade", fval: "4", fcol2: "bunk", fval2: "__none", fmatch: "any" });
    expect(listFiltersQuery(f.slice(0, 1), "any")).toEqual({ fcol: "grade", fval: "4" });
  });
});
