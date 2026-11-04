import { describe, expect, it } from "vitest";
import { exportColumnChanges, keepFilledColumns } from "../export-changes";

const row = (source_data: Record<string, string>, action = "unchanged") => ({ matchedCamperId: "c1", action, changes: [] as { field: string; old: string | null; new: string | null }[], parsed: { source_data } });

describe("export columns as changes", () => {
  it("lists each changed column, old → new, and makes the row an update", () => {
    const r = row({ "ppa.sleeping_at_the_kinus": "Yes", "ppa.shirt": "M", "students.first_name": "Levi" });
    const n = exportColumnChanges([r], new Map([["c1", { "ppa.sleeping_at_the_kinus": "No", "ppa.shirt": "M", "students.first_name": "Levy" }]]), new Map(), ["students.first_name"]);
    expect(n).toBe(1);
    expect(r.action).toBe("update");
    expect(r.changes).toEqual([{ field: "source.ppa.sleeping_at_the_kinus", old: "No", new: "Yes" }]);
  });
  it("a new column with a value is a change; nothing changed stays unchanged", () => {
    const a = row({ "ppa.yarmulka": "6¾" });
    exportColumnChanges([a], new Map([["c1", {}]]), new Map(), []);
    expect(a.changes).toEqual([{ field: "source.ppa.yarmulka", old: null, new: "6¾" }]);
    const b = row({ x: "1" });
    expect(exportColumnChanges([b], new Map([["c1", { x: "1" }]]), new Map(), [])).toBe(0);
    expect(b.action).toBe("unchanged");
  });
  it("a column fixed in Kinus keeps its fix, so it isn't a change", () => {
    const r = row({ "ppa.hebrew_name": "Levi" });
    const fixes = new Map([["c1", { "ppa.hebrew_name": { value: "לוי", was: "Levi" } }]]);
    expect(exportColumnChanges([r], new Map([["c1", { "ppa.hebrew_name": "Levi" }]]), fixes, [])).toBe(0);
  });
});

describe("empty cells change nothing: the export's own columns", () => {
  const before = { "ppa.sleeping_at_the_kinus": "Yes", "Family.city": "Montreal", "ppa.yarmulka_size": "M" };
  it("an empty cell keeps what an earlier export gave; a filled one takes the file's", () => {
    expect(keepFilledColumns(before, { "ppa.sleeping_at_the_kinus": "", "Family.city": "Toronto", "ppa.new_column": "x" })).toEqual({
      "ppa.sleeping_at_the_kinus": "Yes",
      "Family.city": "Toronto",
      "ppa.yarmulka_size": "M",
      "ppa.new_column": "x",
    });
  });
  it("a protected column in our corrected copy can still be cleared", () => {
    expect(keepFilledColumns(before, { "Family.city": " " }, ["family.city"])["Family.city"]).toBe(" ");
  });
  it("so the review shows no change to empty for it", () => {
    const rows = [{ matchedCamperId: "c1", action: "unchanged", changes: [], parsed: { source_data: keepFilledColumns(before, { "ppa.sleeping_at_the_kinus": "" }) } }];
    expect(exportColumnChanges(rows, new Map([["c1", before]]), new Map(), [])).toBe(0);
    expect(rows[0].action).toBe("unchanged");
  });
});
