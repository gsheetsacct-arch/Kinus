import { describe, expect, it } from "vitest";
import { countStatuses, decodeScope, defaultScope, encodeScope, groupRows, inScope, scopeExists, type BoardScope } from "../board";

const tree = {
  groups: [{ id: "g1", name: "Main" }],
  divisions: [
    { id: "d1", name: "Division 1", group_id: "g1", bunks: [{ id: "b1", name: "Bunk 1" }, { id: "b2", name: "Bunk 2" }] },
    { id: "d2", name: "Hebrew", group_id: null, bunks: [{ id: "b3", name: "צריף 1" }] },
  ],
};
const rows = [
  { id: "1", divisionId: "d1", bunkId: "b2", status: "present" as const },
  { id: "2", divisionId: "d1", bunkId: "b1", status: "out" as const },
  { id: "3", divisionId: "d1", bunkId: null, status: "expected" as const },
  { id: "4", divisionId: "d2", bunkId: "b3", status: "present" as const },
];

describe("board", () => {
  it("counts", () => {
    expect(countStatuses(rows)).toMatchObject({ present: 2, out: 1, expected: 1, total: 4 });
  });
  it("round-trips scopes", () => {
    const all: BoardScope[] = [{ kind: "all" }, { kind: "group", id: "g1" }, { kind: "division", id: "d1" }, { kind: "bunk", divisionId: "d1", id: "b2" }];
    for (const s of all) expect(decodeScope(encodeScope(s))).toEqual(s);
    expect(decodeScope("junk")).toBeNull();
  });
  it("checks scopes against the tree", () => {
    expect(scopeExists({ kind: "bunk", divisionId: "d1", id: "b3" }, tree)).toBe(false);
    expect(scopeExists({ kind: "group", id: "g1" }, tree)).toBe(true);
  });
  it("filters by group", () => {
    expect(rows.filter((r) => inScope(r, { kind: "group", id: "g1" }, tree)).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
  it("groups by bunk in bunk order inside a division, unassigned last", () => {
    const g = groupRows(rows.filter((r) => r.divisionId === "d1"), { kind: "division", id: "d1" }, tree);
    expect(g.map((x) => x.title)).toEqual(["Bunk 1", "Bunk 2", "No bunk yet"]);
    expect(g[0].counts.out).toBe(1);
  });
  it("groups by division camp-wide", () => {
    expect(groupRows(rows, { kind: "all" }, tree).map((x) => x.title)).toEqual(["Division 1", "Hebrew"]);
  });
  it("starts counselors on their bunk and heads on their division", () => {
    expect(defaultScope([{ division_id: "d1", bunk_id: "b2" }], tree)).toEqual({ kind: "bunk", divisionId: "d1", id: "b2" });
    expect(defaultScope([{ division_id: "d1", bunk_id: "b1" }, { division_id: "d1", bunk_id: "b2" }], tree)).toEqual({ kind: "division", id: "d1" });
    expect(defaultScope([{ division_id: "d1", bunk_id: null }], tree)).toEqual({ kind: "division", id: "d1" });
    expect(defaultScope([{ division_id: "d1", bunk_id: null }, { division_id: "d2", bunk_id: null }], tree)).toEqual({ kind: "all" });
    expect(defaultScope([], tree)).toEqual({ kind: "all" });
  });
});
