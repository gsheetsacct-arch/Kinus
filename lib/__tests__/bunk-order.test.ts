import { describe, expect, it } from "vitest";
import { compareBunkNames, hebrewLetterNumber, inNaturalOrder } from "../bunk-order";

describe("bunk order", () => {
  it("reads Hebrew-letter numbers in English and Hebrew", () => {
    expect(hebrewLetterNumber("Bunk Yud")).toBe(10);
    expect(hebrewLetterNumber("Bunk Yud Aleph")).toBe(11);
    expect(hebrewLetterNumber("Yud-Beis")).toBe(12);
    expect(hebrewLetterNumber("Tes Vav")).toBe(15);
    expect(hebrewLetterNumber("Chof Gimmel")).toBe(23);
    expect(hebrewLetterNumber("Kaf Bet")).toBe(22);
    expect(hebrewLetterNumber("בונק י״א")).toBe(11);
    expect(hebrewLetterNumber("Lions")).toBeNull();
  });

  it("sorts Yud, Yud Alef … after Tes, not alphabetically", () => {
    const names = ["Bunk Yud Alef", "Bunk Chof", "Bunk Alef", "Bunk Yud", "Bunk Tes", "Bunk Beis", "Bunk Yud Beis", "Bunk Lamed", "Bunk Chof Beis", "Bunk Gimmel"];
    expect([...names].sort(compareBunkNames)).toEqual([
      "Bunk Alef",
      "Bunk Beis",
      "Bunk Gimmel",
      "Bunk Tes",
      "Bunk Yud",
      "Bunk Yud Alef",
      "Bunk Yud Beis",
      "Bunk Chof",
      "Bunk Chof Beis",
      "Bunk Lamed",
    ]);
  });

  it("sorts digits as numbers and other names A–Z after the lettered ones", () => {
    expect(["Bunk 10", "Bunk 2", "Bunk 1"].sort(compareBunkNames)).toEqual(["Bunk 1", "Bunk 2", "Bunk 10"]);
    expect(["Lions", "Bunk Beis", "Bunk Lions", "Bunk Alef"].sort(compareBunkNames)).toEqual(["Bunk Alef", "Bunk Beis", "Bunk Lions", "Lions"]);
    expect(["Yud B", "Yud A"].sort(compareBunkNames)).toEqual(["Yud A", "Yud B"]);
  });

  it("knows when a list is already in order", () => {
    expect(inNaturalOrder(["Alef", "Beis", "Yud", "Yud Alef"])).toBe(true);
    expect(inNaturalOrder(["Alef", "Yud", "Yud Alef", "Beis"])).toBe(false);
  });
});
