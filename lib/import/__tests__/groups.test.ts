import { describe, expect, it } from "vitest";
import { readGroups } from "../groups";
import { applyMapping } from "../mapping";
import { resolveMultiValues } from "../resolve";
import { thursdayOf } from "../thursday";
import { guessTarget, DEFAULT_COLUMN_MAP } from "../default-mapping";

describe("students.group: division, bunk and Thursday in one list", () => {
  it("reads each kind, in any order, leaving out prices and fees", () => {
    expect(readGroups("Division 3,Thursday Program - English,Kinus Main Program - Shluchim subsidized price,Bunk נו - Online School Only")).toEqual({ divisions: ["Division 3"], bunks: ["Bunk נו"], thursday: "Thursday Program - English" });
    expect(readGroups("BM Document,Bunk סא,Kinus Main Program - Shluchim subsidized price,Bar Mitzvah Program")).toEqual({ divisions: ["Bar Mitzvah Program"], bunks: ["Bunk סא"], thursday: null });
    expect(readGroups("Thursday Program - French,Kinus Main Program - Shluchim subsidized price,French Division,Bunk ד French")).toEqual({ divisions: ["French Division"], bunks: ["Bunk ד French"], thursday: "Thursday Program - French" });
    expect(readGroups("Bunk כז,Division 2,Kinus Main Program - Shluchim subsidized price,Late Fee")).toEqual({ divisions: ["Division 2"], bunks: ["Bunk כז"], thursday: null });
    expect(readGroups("Kinus Main Program - Full Tuition - Thank you!,Division 2,Bunk כד").divisions).toEqual(["Division 2"]);
    expect(readGroups("Division 2,Kinus Main Program - Shluchim subsidized price,Late Fee")).toEqual({ divisions: ["Division 2"], bunks: [], thursday: null });
    expect(readGroups("")).toEqual({ divisions: [], bunks: [], thursday: null });
  });

  it("is mapped by itself, and wins over the division and bunk columns", () => {
    expect(guessTarget("students.group")).toBe("groups");
    expect(DEFAULT_COLUMN_MAP["students.group"]).toBe("groups");
    const row = { "students.group": "Bunk לב,Division 2,Kinus Main Program - Shluchim subsidized price", "group_types.division": "Division 3", "group_types.bunks": "Bunk מו" };
    const p = applyMapping(row, { "students.group": "groups", "group_types.division": "division", "group_types.bunks": "bunk" }, {});
    expect([p.division_name, p.bunk_name]).toEqual(["Division 2", "Bunk לב"]);
    // nothing about places in it: the other columns stay
    const q = applyMapping({ ...row, "students.group": "Late Fee" }, { "students.group": "groups", "group_types.division": "division", "group_types.bunks": "bunk" }, {});
    expect([q.division_name, q.bunk_name]).toEqual(["Division 3", "Bunk מו"]);
  });

  it("two divisions: the one the bunk belongs to", () => {
    const rows = [{ parsed: applyMapping({ g: "Division 1,Bunk כג,Division 2,Thursday Program - English" }, { g: "groups" }, {}) }];
    resolveMultiValues(rows, [{ name: "Division 1", bunks: ["Bunk א"] }, { name: "Division 2", bunks: ["Bunk כג"] }]);
    expect([rows[0].parsed.division_name, rows[0].parsed.bunk_name]).toEqual(["Division 2", "Bunk כג"]);
  });

  it("says who's in the Thursday Program (its bunk still from its own column)", () => {
    expect(thursdayOf({ "students.group": "Division 2,Thursday Program - English,Bunk לא", "group_types.thursday_bunks": "7", "ppa.thursday_program_yes_no": "No" }, "students.group")).toEqual({ division: "Thursday Program - English", bunk: "7" });
    // not in the list: not in the program, whatever the other columns say
    expect(thursdayOf({ "students.group": "Division 2,Bunk לא", "group_types.thursday": "Thursday Program - English", "ppa.thursday_program_yes_no": "Yes" }, "students.group")).toBeNull();
  });
});
