import { describe, expect, it } from "vitest";
import { withNameTagDivision } from "../name-tag";

describe("the name-tag division set in Kinus", () => {
  const sheet = { "Hebrew Name": "לוי", "Division (name tag)": "All Access" };
  it("takes the place of the staff sheet's", () => {
    expect(withNameTagDivision(sheet, "Bar Mitzvah Program")).toEqual({ "Hebrew Name": "לוי", "Division (name tag)": "Bar Mitzvah Program" });
    expect(withNameTagDivision(null, "Division 2")).toEqual({ "Division (name tag)": "Division 2" });
  });
  it("null keeps the sheet's; empty takes it away (their division in Kinus)", () => {
    expect(withNameTagDivision(sheet, null)).toBe(sheet);
    expect(withNameTagDivision(sheet, "")).toEqual({ "Hebrew Name": "לוי" });
  });
});
