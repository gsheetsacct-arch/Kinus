import { describe, expect, it } from "vitest";
import { SAMPLE_STAFF, staffValues } from "../print/staff-values";
import { DIVISION_VALUE } from "../print/types";

const values = (details: Record<string, string> | null) => staffValues({ ...SAMPLE_STAFF, details }, (r) => r);

describe("which design a staff badge gets", () => {
  it("the division the office's sheet gives for the name tag, as the badge says", () => {
    const v = values({ "Division (name tag)": "Ohel Rally" });
    expect(v.DIVISION).toBe("Ohel Rally");
    expect(v[DIVISION_VALUE]).toBe("Ohel Rally");
  });
  it("else the division they work in", () => {
    expect(values(null)[DIVISION_VALUE]).toBe("Division 2");
  });
});
