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
  it("English and Hebrew", () => {
    expect(isHebrew("מנחם")).toBe(true);
    expect(isHebrew("Menachem")).toBe(false);
    expect(hasEnglish("מנחם M")).toBe(true);
  });
  it("as other campers have it", () => {
    expect(suggestHebrew("Menachem Mendel", "Mendy", book)).toEqual({ value: "מנחם מענדל", how: "as 2 others named Menachem Mendel have it" });
    expect(suggestHebrew("goldstein", "Goldstein", book)?.value).toBe("גאלדשטיין");
  });
  it("word by word, mixing what's learned and common names", () => {
    expect(suggestHebrew("Menachem Zalman", "", book)?.value).toBe("מנחם זלמן");
  });
  it("common names", () => {
    expect(suggestHebrew("Chaya Mushka", "", book)?.value).toBe("חיה מושקא");
    expect(suggestHebrew("Rivky", "", book)?.value).toBe("רבקה");
  });
  it("spelled-out letters first", () => {
    expect(suggestHebrew("nun shin beis tes", "Nashbat", book)).toEqual({ value: "נשבט", how: "letters spelled out" });
  });
  it("an empty field from the English name; nothing for a Hebrew one", () => {
    expect(suggestHebrew("", "Shmuel", book)?.value).toBe("שמואל");
    expect(suggestHebrew("שמואל", "Shmuel", book)).toBeNull();
    expect(suggestHebrew("Xyzzy", "Qwerty", book)).toBeNull();
  });
});
