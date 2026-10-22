import { describe, expect, it } from "vitest";
import { campersForImport, displaySourceId, idPrefix, intoProgram, layoutFit, LAYOUT_FIT } from "../programs";

describe("a separate program's export", () => {
  it("everyone goes into its division, with ids of its own", () => {
    expect(intoProgram({ division_name: null, source_id: "1234", first_name: "A" }, "Virtual")).toEqual({ division_name: "Virtual", source_id: "virtual:1234", first_name: "A" });
    expect(intoProgram({ division_name: "Division 1", source_id: "virtual:1234" }, "Virtual").source_id).toBe("virtual:1234");
    expect(intoProgram({ division_name: null, source_id: " " }, "Virtual").source_id).toBeNull();
    expect(idPrefix("Virtual Program 2")).toBe("virtual-program-2:");
  });
  it("shows ids as people know them", () => {
    expect(displaySourceId("virtual:1234")).toBe("1234");
    expect(displaySourceId("1234")).toBe("1234");
    expect(displaySourceId(null)).toBeNull();
  });
  it("each file matches only its own campers", () => {
    const all = [{ id: "a", division_name: "Division 1" }, { id: "b", division_name: "Virtual" }, { id: "c", division_name: null }];
    expect(campersForImport(all, "virtual", []).map((c) => c.id)).toEqual(["b"]);
    expect(campersForImport(all, null, ["Virtual"]).map((c) => c.id)).toEqual(["a", "c"]);
  });
  it("a file picks the setup made for its kind of export", () => {
    const main = ["students.id", "students.first_name", "students.last_name", "group_types.bunks", "ppa.hebrew_name", "family.city"];
    const virtual = ["Student ID", "First Name", "Last Name", "Grade", "Parent Email"];
    expect(layoutFit(virtual, { headers: main, mapped: [] })).toBeLessThan(LAYOUT_FIT);
    expect(layoutFit(virtual, { headers: virtual, mapped: [] })).toBe(1);
    // two exports sharing most columns: the exact one fits better
    const virtual2 = [...main.slice(0, 5), "zoom_link"];
    expect(layoutFit(virtual2, { headers: virtual2, mapped: [] })).toBeGreaterThan(layoutFit(virtual2, { headers: main, mapped: [] }));
    // a setup saved before setups knew their columns: what it matched, never quite a full fit
    expect(layoutFit(main, { mapped: main })).toBeCloseTo(0.99);
  });
});

import { guessTarget } from "../default-mapping";
describe("a new kind of export", () => {
  it("guesses the usual columns", () => {
    expect(["First Name", "Last Name", "Student ID", "Grade", "T-Shirt Size", "Parent Email"].map(guessTarget)).toEqual(["first_name", "last_name", "source_id", "grade", "tshirt_size", null]);
  });
});
