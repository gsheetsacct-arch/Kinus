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

describe("camper print order", () => {
  it("by division then last name, or by last name", async () => {
    const { sortFor } = await import("../data");
    const c = (first_name: string, last_name: string, division_name: string | null, bunk_name: string | null) => ({ first_name, last_name, division_name, bunk_name }) as never;
    const rows = [c("A", "Zalman", "Division 2", "Bunk ב"), c("B", "Adler", "Division 10", "Bunk א"), c("C", "Katz", "Division 2", "Bunk א"), c("D", "Berg", null, null)];
    const last = (o: "division" | "name") => [...rows].sort(sortFor(o)).map((x: { last_name: string }) => x.last_name);
    expect(last("division")).toEqual(["Katz", "Zalman", "Adler", "Berg"]);
    expect(last("name")).toEqual(["Adler", "Berg", "Katz", "Zalman"]);
  });
});
