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
    expect(rows).toEqual([{ line: 2, name: "Levi Cohen", email: "a@x.com", role: "Counselor", where: "Division 2", bunk: "Bunk Chof", level: "", title: "", phone: "", signs: "" }]);
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
        { line: 2, name: "A", email: "a@x.com", role: "", where: "Division 1", bunk: "Bunk Beis", level: "", title: "", phone: "" },
        { line: 3, name: "B", email: "a@x.com", role: "", where: "Division 1", bunk: "", level: "", title: "", phone: "" },
        { line: 4, name: "C", email: "c@x.com", role: "Counselor", where: "", bunk: "", level: "", title: "", phone: "" },
        { line: 5, name: "D", email: "d@x.com", role: "office", where: "", bunk: "", level: "view", title: "", phone: "" },
      ],
      tree,
      { role: "counselor", level: "role" },
    );
    expect(plan[0]).toMatchObject({ role: "counselor", errors: [], areaText: "Division 1 · Bunk Beis" });
    expect(plan[1].errors).toContain("This email is listed twice.");
    expect(plan[2].errors[0]).toMatch(/Say where they work/);
    expect(plan[3]).toMatchObject({ role: "office", allAreas: true, level: "view", errors: [] });
  });
  it("suggests the nearest role for a typo", () => {
    const [row] = planRows([{ line: 2, name: "Levi", email: "levi@x.com", role: "Councelor", where: "All", bunk: "", level: "", title: "", phone: "" }], { groups: [], divisions: [] }, { role: "counselor", level: "role" });
    expect(row.errors.join(" ")).toMatch(/Did you mean “counselor”/);
  });
  it("defaults the division for someone over one division, and reads a Position column", () => {
    const rows = readRows([
      ["Name", "Email", "Position", "Bunk"],
      ["Levi", "levi@x.com", "Counselor", "Bunk Beis"],
      ["Mendy", "mendy@x.com", "Waterfront", ""],
    ]);
    const plan = planRows(rows, tree, { role: "counselor", level: "role", where: "Division 1" });
    expect(plan[0]).toMatchObject({ role: "counselor", title: "", errors: [] });
    expect(plan[0].areaText).toMatch(/Bunk Beis/);
    expect(plan[1]).toMatchObject({ role: "counselor", title: "Waterfront", areaText: "Division 1", errors: [] });
  });
});

describe("sign-in", () => {
  const tree = { groups: [], divisions: [{ id: "d1", name: "Division 1", group_id: null, color: null, bunks: [{ id: "b1", name: "Bunk Alef" }] }] };
  it("lists counselors without an email or sign-in, unless the sheet says they sign in", () => {
    const rows = readRows([
      ["Name", "Email", "Role", "Bunk", "Signs in"],
      ["Moshe", "", "Counselor", "Bunk Alef", ""],
      ["Dovid", "d@x.com", "Counselor", "Bunk Alef", "yes"],
      ["Levi", "", "Head counselor", "Bunk Alef", ""],
    ]);
    const plan = planRows(rows, tree as never, { role: "counselor", level: "role", where: "Division 1" });
    expect(plan[0]).toMatchObject({ login: "none", errors: [] });
    expect(plan[1]).toMatchObject({ login: "personal", errors: [] });
    expect(plan[2].errors[0]).toMatch(/Missing email/);
  });
});

describe("just adding people to the list", () => {
  it("doesn't need an email when nobody new signs in", async () => {
    const { errorsFor, MISSING_EMAIL } = await import("../bulk");
    expect(errorsFor([MISSING_EMAIL], "invite")).toEqual([MISSING_EMAIL]);
    expect(errorsFor([MISSING_EMAIL, "Unknown role “x”."], "none")).toEqual(["Unknown role “x”."]);
  });
});

describe("the Staff role", () => {
  it("is what \"staff\" means on a sheet, without taking head staff or counselors", async () => {
    const { matchRole } = await import("../bulk");
    expect(matchRole("Staff")).toBe("staff");
    expect(matchRole("Kitchen staff")).toBe("staff");
    expect(matchRole("Head staff")).toBe("head_counselor");
    expect(matchRole("Counselor")).toBe("counselor");
  });
});
