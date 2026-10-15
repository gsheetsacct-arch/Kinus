import { describe, expect, it } from "vitest";
import { withFixes } from "../source-fixes";
import { sourceValues } from "../print/merge";

describe("staff fixes to export columns", () => {
  const data = { "ppa#hebrew_name": "Menachem", "ppa.hebrew_last_name": "Cohen", grade: "5" };
  const fixes = { "ppa.hebrew_name": { value: "מנחם", was: "Menachem" } };
  it("replace what the registration says, whatever the column's spelling", () => {
    expect(withFixes(data, fixes)).toEqual({ "ppa#hebrew_name": "מנחם", "ppa.hebrew_last_name": "Cohen", grade: "5" });
  });
  it("labels read the fix", () => {
    const get = sourceValues({ first_name: "Mendy", last_name: "Cohen", source_data: data, source_fixes: fixes } as never);
    expect(get("source.ppa.hebrew_name")).toBe("מנחם");
    expect(get("source.ppa.hebrew_last_name")).toBe("Cohen");
  });
  it("no fixes, or junk: the registration as is", () => {
    expect(withFixes(data, {})).toBe(data);
    expect(withFixes(data, { x: 5 })).toBe(data);
  });
});
