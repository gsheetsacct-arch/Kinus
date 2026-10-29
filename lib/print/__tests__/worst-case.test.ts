import { describe, expect, it } from "vitest";
import { worstValues } from "../worst-case";

const people = [
  { FIRST: "Menachem Mendel (Menny)", LAST: "Cohen", FROM: "Brooklyn, NY USA", BUNK: "Alef" },
  { FIRST: "Levi", LAST: "Kirschenbaum", FROM: "CAPITAL FEDERAL, CAPITAL FEDERAL Argentina", BUNK: "Yud Alef" },
  { FIRST: "Shmuel", LAST: "Teleshevsky", FROM: "Crown Heights", BUNK: "Beis" },
];
const widest = { FIRST: "Menachem Mendel (Menny)", LAST: "Kirschenbaum", FROM: "CAPITAL FEDERAL, CAPITAL FEDERAL Argentina", BUNK: "Yud Alef", CODE: "0123" };

describe("worst case values", () => {
  it("never makes up a name from two people: a part's fields come from one person", () => {
    const v = worstValues(people, [{ text: "{{FIRST}} {{LAST}}", w: 80 }], widest);
    expect(`${v.FIRST} ${v.LAST}`).toBe("Menachem Mendel (Menny) Cohen");
  });

  it("each part on its own keeps its widest value; fields on no part keep the widest of anyone", () => {
    const v = worstValues(people, [{ text: "{{FIRST}} {{LAST}}", w: 80 }, { text: "From {{FROM}}", w: 60 }], widest);
    expect(v.FROM).toBe("CAPITAL FEDERAL, CAPITAL FEDERAL Argentina");
    expect(v.BUNK).toBe("Yud Alef");
    expect(v.CODE).toBe("0123");
  });

  it("parts sharing a field (front and back name) are filled by the same person", () => {
    const v = worstValues(people, [{ text: "{{FIRST}}", w: 10 }, { text: "{{FIRST}} {{LAST}}", w: 80 }, { text: "{{LAST}}", w: 200 }], widest);
    expect([v.FIRST, v.LAST]).toEqual(["Menachem Mendel (Menny)", "Cohen"]);
  });

  it("with no parts, every field at its widest as before", () => {
    expect(worstValues(people, [], widest)).toEqual(widest);
  });
});
