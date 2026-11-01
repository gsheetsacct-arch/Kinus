import { describe, expect, it } from "vitest";
import { sortStaff } from "../order";

const p = (FIRST: string, LAST: string, DIVISION: string, BUNK = "") => ({ values: { FIRST, LAST, DIVISION, BUNK } });

describe("staff print order", () => {
  const people = [p("Moshe", "Levi", "Division 10"), p("Dovid", "Cohen", ""), p("Ari", "Gold", "Division 2", "Bunk 3"), p("Yossi", "Adler", "Division 2", "Bunk 1")];
  const names = (o: Parameters<typeof sortStaff>[1]) => sortStaff(people, o).map((x) => x.values.LAST);
  it("groups by division (numbers in order, no division last), last name within", () => {
    expect(names("division")).toEqual(["Adler", "Gold", "Levi", "Cohen"]);
  });
  it("by bunk within the division", () => {
    expect(names("bunk")).toEqual(["Adler", "Gold", "Levi", "Cohen"]);
  });
  it("by last name only", () => {
    expect(names("name")).toEqual(["Adler", "Cohen", "Gold", "Levi"]);
  });
});
