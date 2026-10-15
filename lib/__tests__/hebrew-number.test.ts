import { describe, expect, it } from "vitest";
import { convertNumber, findNumber, toHebrewNumeral } from "../hebrew-number";
import { applyTransforms } from "../print/merge";
import { compareBunkNames } from "../bunk-order";

describe("toHebrewNumeral", () => {
  it("writes numbers in Hebrew letters", () => {
    expect([1, 9, 10, 11, 12, 15, 16, 19, 20, 21, 99, 100, 115, 400, 500].map((n) => toHebrewNumeral(n))).toEqual(["א", "ט", "י", "יא", "יב", "טו", "טז", "יט", "כ", "כא", "צט", "ק", "קטו", "ת", "תק"]);
  });
  it("adds geresh and gershayim with marks", () => {
    expect(toHebrewNumeral(1, true)).toBe("א׳");
    expect(toHebrewNumeral(11, true)).toBe("י״א");
    expect(toHebrewNumeral(15, true)).toBe("ט״ו");
  });
});

describe("findNumber / convertNumber", () => {
  it("reads every spelling of a bunk number", () => {
    for (const [text, n] of [
      ["Bunk Yud Alef", 11],
      ["Bunk Yud-Beis", 12],
      ["Kuf", 100],
      ["Chof Beis", 22],
      ["יא", 11],
      ["י״א", 11],
      ["צריף ט״ו", 15],
      ["Bunk 14", 14],
      ["Bunk Alef", 1],
    ] as const)
      expect([text, findNumber(text)?.value]).toEqual([text, n]);
  });
  it("converts to digits or Hebrew letters", () => {
    expect(convertNumber("Bunk Yud Alef", "number")).toBe("11");
    expect(convertNumber("Bunk Yud Alef", "hebrew")).toBe("יא");
    expect(convertNumber("Bunk 16", "hebrew")).toBe("טז");
    expect(convertNumber("יב", "number")).toBe("12");
    expect(convertNumber("Bunk Kuf", "hebrew_marks")).toBe("ק׳");
  });
  it("can keep the words around the number", () => {
    expect(convertNumber("Bunk Yud Alef", "number", true)).toBe("Bunk 11");
    expect(convertNumber("Bunk Yud Alef (upper)", "hebrew", true)).toBe("Bunk יא (upper)");
  });
  it("leaves text without a number alone, and doesn't read Hebrew words as numbers", () => {
    expect(convertNumber("Staff house", "number")).toBe("Staff house");
    expect(findNumber("בית")).toBeNull();
    expect(convertNumber("בית ב", "number")).toBe("2");
  });
  it("is a merge-field conversion", () => {
    expect(applyTransforms("Bunk Chof Daled", [{ type: "hebrew_number", to: "hebrew" }], new Map())).toBe("כד");
    expect(applyTransforms("Bunk Chof Daled", [{ type: "replace", pattern: "^Bunk\\s+", replacement: "", flags: "i" }, { type: "hebrew_number", to: "number" }], new Map())).toBe("24");
  });
  it("still sorts Alef-Beis bunks by number", () => {
    expect(["Bunk Yud Beis", "Bunk Tes", "Bunk Yud Alef", "Bunk Kuf"].sort(compareBunkNames)).toEqual(["Bunk Tes", "Bunk Yud Alef", "Bunk Yud Beis", "Bunk Kuf"]);
  });
});
