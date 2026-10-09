import { describe, it, expect } from "vitest";
import { matchAreas, matchRole, planRows, readRows } from "../bulk";
import type { AreaTree } from "@/lib/data/areas";

const tree: AreaTree = {
  groups: [{ id: "g1", name: "Main camp" }],
  divisions: [
    { id: "d1", name: "Division 1", group_id: "g1", color: null, bunks: [{ id: "b1", name: "Bunk Alef" }, { id: "b2", name: "Bunk Beis" }] },
    { id: "d2", name: "Division 2", group_id: "g1", color: null, bunks: [{ id: "b3", name: "Bunk Chof" }, { id: "b4", name: "Bunk Alef" }] },
    { id: "d3", name: "Hebrew Division", group_id: null, color: null, bunks: [{ id: "b5", name: "Group 112 עברית" }] },
  ],
};

describe("readRows", () => {
  it("reads a sheet with headers in any order", () => {
    const rows = readRows([["Email", "Full name", "Bunk", "Division", "Role"], ["A@x.com", "Levi Cohen", "Bunk Chof", "Division 2", "Counselor"], ["", "", "", "", ""]]);
    expect(rows).toEqual([{ line: 2, name: "Levi Cohen", email: "a@x.com", role: "Counselor", where: "Division 2", bunk: "Bunk Chof", level: "" }]);
  });
  it("reads a sheet without headers (name, email, role, division, bunk)", () => {
    expect(readRows([["Levi", "l@x.com", "hc", "Main camp", ""]])[0]).toMatchObject({ name: "Levi", email: "l@x.com", role: "hc", where: "Main camp" });
    expect(readRows([["l@x.com", "Levi"]])[0]).toMatchObject({ name: "Levi", email: "l@x.com" });
  });
});

describe("matching", () => {
  it("understands role words", () => {
    expect(matchRole("Head Counsellor")).toBe("head_counselor");
    expect(matchRole("admin")).toBe("director");
    expect(matchRole("bunk counselor")).toBe("counselor");
    expect(matchRole("chef")).toBeNull();
  });
  it("matches groups, divisions, bunks and 'all'", () => {
    expect(matchAreas("Main camp", "", tree)).toMatchObject({ allAreas: false, areas: [{ group_id: "g1", division_id: null, bunk_id: null }], errors: [] });
    expect(matchAreas("division 2", "bunk chof", tree).areas).toEqual([{ group_id: null, division_id: "d2", bunk_id: "b3" }]);
    expect(matchAreas("", "Group 112 עברית", tree).areas).toEqual([{ group_id: null, division_id: "d3", bunk_id: "b5" }]);
    expect(matchAreas("All of camp", "", tree).allAreas).toBe(true);
    expect(matchAreas("Division 1; Hebrew Division", "", tree).areas).toHaveLength(2);
  });
  it("explains mistakes with suggestions", () => {
    expect(matchAreas("Divison 2", "", tree).errors[0]).toMatch(/Did you mean “Division 2”/);
    expect(matchAreas("", "Bunk Alef", tree).errors[0]).toMatch(/exists in Division 1 and Division 2/);
    expect(matchAreas("Division 1", "Bunk Chof", tree).errors[0]).toMatch(/No bunk called “Bunk Chof” in Division 1/);
  });
});

describe("planRows", () => {
  it("applies the default role, flags duplicates and missing places", () => {
    const plan = planRows(
      [
        { line: 2, name: "A", email: "a@x.com", role: "", where: "Division 1", bunk: "Bunk Beis", level: "" },
        { line: 3, name: "B", email: "a@x.com", role: "", where: "Division 1", bunk: "", level: "" },
        { line: 4, name: "C", email: "c@x.com", role: "Counselor", where: "", bunk: "", level: "" },
        { line: 5, name: "D", email: "d@x.com", role: "office", where: "", bunk: "", level: "view" },
      ],
      tree,
      { role: "counselor", level: "role" },
    );
    expect(plan[0]).toMatchObject({ role: "counselor", errors: [], areaText: "Division 1 · Bunk Beis" });
    expect(plan[1].errors).toContain("This email is listed twice.");
    expect(plan[2].errors[0]).toMatch(/Say where they work/);
    expect(plan[3]).toMatchObject({ role: "office", allAreas: true, level: "view", errors: [] });
  });
});
