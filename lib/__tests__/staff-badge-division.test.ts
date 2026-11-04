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

describe("the role in Hebrew", () => {
  const person = (role: string, division: string, camp: string) => staffValues({ ...SAMPLE_STAFF, role, details: null, places: [{ division, camp, color: null, bunk: null }] }, (r) => r);
  it("for the Hebrew camps' head counselors, counselors and directors", () => {
    expect(person("head_counselor", "Hebrew Division", "Hebrew").ROLE_HE).toBe("גנרל");
    expect(person("counselor", "Thursday Program - Hebrew", "Thursday Hebrew").ROLE_HE).toBe("מדריך");
    expect(person("director", "Hebrew Division", "Hebrew").ROLE_HE).toBe("מנהל");
  });
  it("nothing for other roles, or other camps (their English role prints)", () => {
    expect(person("logistics", "Hebrew Division", "Hebrew").ROLE_HE).toBe("");
    expect(person("counselor", "Division 2", "American").ROLE_HE).toBe("");
    expect(person("counselor", "Division 2", "American").ROLE).toBe("counselor");
  });
});
