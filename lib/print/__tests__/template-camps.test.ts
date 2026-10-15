import { describe, expect, it } from "vitest";
import { forCamp, templateCamps, templateDivisionIds } from "../template-camps";

const camps = [
  { name: "American", divisionIds: ["d1", "d2"] },
  { name: "Hebrew", divisionIds: ["h1"] },
  { name: "French", divisionIds: ["f1"] },
];

describe("templates for some camps", () => {
  it("none ticked: every camp", () => {
    expect(templateCamps({})).toEqual([]);
    expect(forCamp({ camps: [] }, "Hebrew")).toBe(true);
    expect(templateDivisionIds({ camps: [] }, camps)).toBeNull();
  });
  it("by camp name, whatever the case", () => {
    const t = { camps: ["hebrew ", "French"] };
    expect(forCamp(t, "Hebrew")).toBe(true);
    expect(forCamp(t, "American")).toBe(false);
    // looking at every camp: every template is offered
    expect(forCamp(t, null)).toBe(true);
    expect(templateDivisionIds(t, camps)).toEqual(["h1", "f1"]);
  });
  it("a camp that's gone this session prints for nobody", () => {
    expect(templateDivisionIds({ camps: ["Canadian"] }, camps)).toEqual([]);
  });
});
