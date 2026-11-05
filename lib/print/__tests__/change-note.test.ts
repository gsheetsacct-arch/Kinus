import { describe, expect, it } from "vitest";
import { changeNote } from "../change-note";

describe("the new / updated lines on a print job's note", () => {
  it("lists who's new and who's updated, by name, one line each", () => {
    expect(changeNote([{ name: "Moshe Levy", kind: "updated" }, { name: "Ari Cohen", kind: "new" }, { name: "Ben Adler", kind: "new" }])).toBe("\nNew (2): Ari Cohen, Ben Adler\nSwap out (1): Moshe Levy");
  });
  it("is empty when there's nobody", () => {
    expect(changeNote([])).toBe("");
  });
});
