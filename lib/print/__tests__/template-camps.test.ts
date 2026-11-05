import { describe, expect, it } from "vitest";
import { forCamp, templateCamps, templateDivisionIds, templateSkipsDivisionIds } from "../template-camps";
import { defaultNameTagsOnly, nameTagsOnlyRule } from "../name-tags-only";

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

describe("camps that get name tags only", () => {
  const withVirtual = [...camps, { name: "Virtual", divisionIds: ["v1"], nameTagsOnly: true }, { name: "Thursday American", divisionIds: ["t1"], nameTagsOnly: true }];
  it("not saved yet: Thursday and Virtual", () => {
    expect(defaultNameTagsOnly("Thursday Hebrew")).toBe(true);
    expect(defaultNameTagsOnly("virtual")).toBe(true);
    expect(defaultNameTagsOnly("American")).toBe(false);
    expect(nameTagsOnlyRule(null)("Virtual")).toBe(true);
  });
  it("saved: just those camps, by name", () => {
    const rule = nameTagsOnlyRule({ camps: ["virtual "] });
    expect(rule("Virtual")).toBe(true);
    expect(rule("Thursday American")).toBe(false);
    expect(nameTagsOnlyRule({ camps: [] })("Virtual")).toBe(false);
  });
  it("other templates leave their divisions out; name tags and templates for them don't", () => {
    expect(templateSkipsDivisionIds({ kind: "luggage_tag", camps: [] }, withVirtual)).toEqual(["v1", "t1"]);
    expect(templateSkipsDivisionIds({ kind: "name_tag", camps: [] }, withVirtual)).toEqual([]);
    expect(templateSkipsDivisionIds({ kind: "other", camps: ["Virtual"] }, withVirtual)).toEqual([]);
    expect(templateDivisionIds({ kind: "other", camps: ["Virtual"] }, withVirtual)).toEqual(["v1"]);
  });
  it("offered for the camp: name tags, and templates that list it", () => {
    expect(forCamp({ kind: "luggage_tag" }, "Virtual", true)).toBe(false);
    expect(forCamp({ kind: "name_tag" }, "Virtual", true)).toBe(true);
    expect(forCamp({ kind: "other", camps: ["Virtual"] }, "Virtual", true)).toBe(true);
    expect(forCamp({ kind: "luggage_tag" }, "American", false)).toBe(true);
  });
});
