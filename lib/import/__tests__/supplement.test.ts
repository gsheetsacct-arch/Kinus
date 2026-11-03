import { describe, expect, it } from "vitest";
import { guessIdColumn, matchRows } from "../supplement";

describe("a file of extra details", () => {
  it("finds the registration ID column", () => {
    expect(guessIdColumn(["students.id", "ppa.bus", "ppa.room"])).toBe("students.id");
    expect(guessIdColumn(["Name", "Registration ID", "Bus"])).toBe("Registration ID");
    expect(guessIdColumn(["Bus", "Room"])).toBe(null);
  });
  it("matches rows by ID, a program's prefixed IDs too, and says which it couldn't", () => {
    const campers = [
      { id: "a", source_id: "1234" },
      { id: "b", source_id: "online:5678" },
    ];
    const r = matchRows([{ "students.id": "1234", bus: "3" }, { "students.id": "5678.0", bus: "1" }, { "students.id": "999", bus: "2" }, { "students.id": "", bus: "4" }], "students.id", campers);
    expect(r.matched.map((m) => m.camperId)).toEqual(["a", "b"]);
    expect(r.unmatched).toEqual(["999"]);
    expect(r.noId).toBe(1);
  });
});
