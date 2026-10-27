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

  it("finds the code as printed on the tag (KN…)", () => {
    const e = searchEntry("Levi Cohen", "100180");
    expect(matchScore(e, "KN100180")).toBeGreaterThan(0);
    expect(matchScore(e, "kn1001")).toBeGreaterThan(0);
  });
});

describe("similar names and misspellings", () => {
  const e = (name: string) => searchEntry(name, "100001");
  const finds = (name: string, q: string) => matchScore(e(name), q) > 0;
  it("spellings that sound the same", () => {
    for (const [name, q] of [
      ["Chaim Cohen", "haim"],
      ["Menachem Mendel Friedman", "menahem"],
      ["Tzvi Hirsh Katz", "zvi"],
      ["Shneur Zalman Levine", "schneur"],
      ["Shneur Zalman Levine", "shneor zalmen"],
      ["Moshe Gurary", "moishe"],
      ["Dovid Shapiro", "david"],
      ["Rivkah Kaplan", "rivka"],
      ["Rifka Kaplan", "rivka"],
      ["Yitzchak Raskin", "itzchok"],
      ["Sholom Ber", "shalom"],
      ["Mushka Gordon", "mushky"],
      ["Chana Hecht", "hannah"],
      ["מנחם מענדל שפירא", "מנדל"],
    ]) expect(finds(name, q), `${q} → ${name}`).toBe(true);
  });
  it("typos: a letter wrong, missing, extra or swapped, while still typing too", () => {
    for (const [name, q] of [
      ["Menachem Friedman", "menahcem"],
      ["Menachem Friedman", "frideman"],
      ["Menachem Friedman", "freidman"],
      ["Levi Kaplan", "kaplna"],
      ["Yehuda Teitelbaum", "teitlebau"],
      ["Devorah Fisch", "devora fish"],
    ]) expect(finds(name, q), `${q} → ${name}`).toBe(true);
  });
  it("exact matches still come first, similar ones after", () => {
    expect(matchScore(e("Khaim Levy"), "khaim")).toBeGreaterThan(matchScore(e("Chaim Levy"), "khaim"));
    expect(matchScore(e("Chaim Levy"), "khaim")).toBeGreaterThan(0);
    expect(matchScore(e("Chaim Levy"), "khaim")).toBeLessThan(1);
  });
  it("not everything matches", () => {
    for (const [name, q] of [
      ["Levi Kaplan", "moshe"],
      ["Chana Cohen", "chaim"],
      ["Sarah Levine", "zalman"],
      ["Leah Wolf", "lea fisch"],
      ["Eli Raskin", "ali"],
    ]) expect(finds(name, q), `${q} ✗ ${name}`).toBe(false);
  });
});

describe("buzzer numbers", () => {
  it("a number finds whoever has that buzzer (7 or 007)", () => {
    const e = searchEntry("Levi Cohen", "100180", [], 7);
    expect(matchScore(e, "7")).toBeGreaterThan(0);
    expect(matchScore(e, "007")).toBeGreaterThan(0);
    expect(matchScore(e, "8")).toBe(0);
    expect(matchScore(searchEntry("Levi Cohen", "100180"), "7")).toBe(0);
  });
});

describe("not too loose", () => {
  it("a short sound-alike doesn't pull in every name starting the same way", () => {
    expect(matchScore(searchEntry("Berel Gordon", "1"), "gurery")).toBe(0);
    expect(matchScore(searchEntry("Mendy Gurary", "1"), "gurery")).toBeGreaterThan(0);
  });
});
