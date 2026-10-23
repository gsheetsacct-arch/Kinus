import { describe, expect, it } from "vitest";
import { carryPlan } from "../carry-plan";

const groups = [
  { id: "g-old-fr", name: "French", session_id: "old" },
  { id: "g-new-fr", name: "French ", session_id: "new" },
];
const divisions = [
  { id: "d-old-2", name: "Division 2", session_id: "old" },
  { id: "d-new-2", name: "division 2", session_id: "new" },
  { id: "d-old-9", name: "Division 9", session_id: "old" },
];
const bunks = [
  { id: "b-old-a", name: "Alef", division_id: "d-old-2" },
  { id: "b-new-a", name: "Alef", division_id: "d-new-2" },
  { id: "b-old-b", name: "Beis", division_id: "d-old-2" },
];
const s = (user_id: string, group_id: string | null, division_id: string | null, bunk_id: string | null = null) => ({ user_id, group_id, division_id, bunk_id, created_by: "owner" });

describe("staff areas follow into a new session", () => {
  it("camps, divisions and bunks by name", () => {
    expect(carryPlan("new", [s("u1", "g-old-fr", null), s("u2", null, "d-old-2"), s("u3", null, "d-old-2", "b-old-a")], groups, divisions, bunks)).toEqual([
      { user_id: "u1", group_id: "g-new-fr", division_id: null, bunk_id: null, created_by: "owner" },
      { user_id: "u2", group_id: null, division_id: "d-new-2", bunk_id: null, created_by: "owner" },
      { user_id: "u3", group_id: null, division_id: "d-new-2", bunk_id: "b-new-a", created_by: "owner" },
    ]);
  });
  it("never more than they had: a missing bunk or division isn't carried", () => {
    expect(carryPlan("new", [s("u1", null, "d-old-2", "b-old-b"), s("u2", null, "d-old-9")], groups, divisions, bunks)).toEqual([]);
  });
  it("leaves alone anyone who already has an area in the new session", () => {
    expect(carryPlan("new", [s("u1", null, "d-new-2"), s("u1", "g-old-fr", null)], groups, divisions, bunks)).toEqual([]);
  });
  it("the same place from two old sessions is added once", () => {
    const more = [...divisions, { id: "d-older-2", name: "Division 2", session_id: "older" }];
    expect(carryPlan("new", [s("u1", null, "d-old-2"), s("u1", null, "d-older-2")], groups, more, bunks)).toHaveLength(1);
  });
});
