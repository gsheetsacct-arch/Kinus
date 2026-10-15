import { describe, expect, it } from "vitest";
import { hasEnglish, isHebrew, lettersSpelledOut, NameBook, suggestHebrew, withFinalLetters } from "../hebrew-names";

describe("letters spelled out", () => {
  it("turns letter names into Hebrew letters", () => {
    expect(lettersSpelledOut("nun shin beis tes")).toBe("נשבט");
    expect(lettersSpelledOut("Nun, Shin, Beis, Tes")).toBe("נ ש ב ט".replace(/ /g, " ")); // commas part words
  });
  it("puts final letters at word ends", () => {
    expect(lettersSpelledOut("mem nun ches mem")).toBe("מנחם");
    expect(lettersSpelledOut("mem nun ches mem / mem ayin nun daled lamed")).toBe("מנחם מענדל");
    expect(lettersSpelledOut("kuf lamed mem nun")).toBe("קלמן");
    expect(lettersSpelledOut("chof hei nun")).toBe("כהן");
  });
  it("takes hyphens and different spellings", () => {
    expect(lettersSpelledOut("yud-tzadik-ches-kuf")).toBe("יצחק");
    expect(lettersSpelledOut("Shin Lamed Vov Mem")).toBe("שלום");
  });
  it("leaves ordinary words alone", () => {
    expect(lettersSpelledOut("Menachem")).toBeNull();
    expect(lettersSpelledOut("nun")).toBeNull();
    expect(lettersSpelledOut("nun shin something")).toBeNull();
  });
  it("final letters only at the end", () => {
    expect(withFinalLetters("ךלם")).toBe("כלם");
  });
});

describe("suggestions", () => {
  const book = new NameBook();
  book.learn("Menachem Mendel", "מנחם מענדל");
  book.learn("Menachem Mendel", "מנחם מענדל");
  book.learn("Zalman", "זלמן");
  book.learn("Goldstein", "גאלדשטיין");
  // a different name, not a spelling: teaches nothing
  book.learn("Menachem", "מנחם מענדל");
  it("English and Hebrew", () => {
    expect(isHebrew("מנחם")).toBe(true);
    expect(isHebrew("Menachem")).toBe(false);
    expect(hasEnglish("מנחם M")).toBe(true);
  });
  it("exact matches first: the same words", () => {
    expect(suggestHebrew("Menachem Mendel", "Mendy", book)).toEqual({ value: "מנחם מענדל", how: "2 others named exactly Menachem Mendel have it like this", source: "exact" });
    expect(suggestHebrew("goldstein", "Goldstein", book)?.source).toBe("exact");
  });
  it("Menachem isn't Menachem Mendel, and Zev isn't Zevi", () => {
    expect(suggestHebrew("Menachem", "", book)).toEqual({ value: "מנחם", how: "Menachem on the list of common names", source: "common" });
    expect(suggestHebrew("Zev", "", book)?.value).toBe("זאב");
    expect(suggestHebrew("Zevi", "", book)?.value).toBe("צבי");
  });
  it("word by word from other campers, then partly from the list", () => {
    expect(suggestHebrew("Menachem Zalman", "", book)).toMatchObject({ value: "מנחם זלמן", source: "words" });
    expect(suggestHebrew("Zalman Rivka", "", book)).toMatchObject({ value: "זלמן רבקה", source: "common" });
  });
  it("nicknames last, and said so", () => {
    expect(suggestHebrew("Mendy", "", book)).toMatchObject({ value: "מנחם מענדל", source: "nickname" });
    expect(suggestHebrew("Chaya Mushka", "", book)).toMatchObject({ value: "חיה מושקא", source: "common" });
  });
  it("spelled-out letters first", () => {
    expect(suggestHebrew("nun shin beis tes", "Nashbat", book)).toEqual({ value: "נשבט", how: "letters spelled out", source: "letters" });
  });
  it("an empty field from the English name; nothing for a Hebrew one", () => {
    expect(suggestHebrew("", "Shmuel", book)?.value).toBe("שמואל");
    expect(suggestHebrew("שמואל", "Shmuel", book)).toBeNull();
    expect(suggestHebrew("Xyzzy", "Qwerty", book)).toBeNull();
  });
});
