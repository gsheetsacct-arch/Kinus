import { describe, expect, it } from "vitest";
import { matchScore, searchEntry } from "../search";

const levi = searchEntry("Levi Yitzchok Cohen", "100016", ["+1 (718) 555-1234", "7185559876"]);
const heb = searchEntry("מנחם מענדל שפירא", "100024");
const fr = searchEntry("Élie Benhamou", "100031");

describe("matchScore", () => {
  it("finds names by any word, in any order", () => {
    expect(matchScore(levi, "levi")).toBeGreaterThan(0);
    expect(matchScore(levi, "cohen levi")).toBeGreaterThan(0);
    expect(matchScore(levi, "coh")).toBeGreaterThan(0);
    expect(matchScore(levi, "levi katz")).toBe(0);
  });
  it("ranks a full-name prefix highest", () => {
    expect(matchScore(levi, "levi y")).toBeGreaterThan(matchScore(levi, "cohen"));
  });
  it("handles Hebrew final letters and French accents", () => {
    expect(matchScore(heb, "מנחם")).toBeGreaterThan(0);
    expect(matchScore(heb, "שפירא")).toBeGreaterThan(0);
    expect(matchScore(fr, "elie")).toBeGreaterThan(0);
  });
  it("finds codes and parent phones", () => {
    expect(matchScore(levi, "1000")).toBe(3);
    expect(matchScore(levi, "1234")).toBe(2);
    expect(matchScore(levi, "555-9876")).toBe(2);
    expect(matchScore(levi, "999")).toBe(0);
  });
  it("matches everything when empty", () => {
    expect(matchScore(levi, "  ")).toBe(1);
  });
});
