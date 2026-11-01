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

describe("sorted by the names the tag prints", () => {
  it("finds the English and Hebrew name fields the template uses", async () => {
    const { printedNameKeys } = await import("../merge");
    const fields = [
      { key: "FIRST", label: "First name" },
      { key: "LAST", label: "Last name" },
      { key: "FAMILY", label: "Family name (registration)" },
      { key: "HEB_FIRST", label: "Hebrew name" },
      { key: "HEB_LAST", label: "Hebrew last name" },
      { key: "MOTHER_FIRST", label: "Mother first name" },
    ];
    const tag = (text: string) => ({ layers: [{ type: "text", id: "n", text, x: 0, y: 0, w: 1, h: 1, size: 10 }] }) as never;
    expect(printedNameKeys(tag("{{FIRST}} {{LAST}}"), fields)).toEqual({ last: "LAST", first: "FIRST", hebLast: "HEB_LAST", hebFirst: "HEB_FIRST" });
    // the template prints another column as the last name: that one
    expect(printedNameKeys(tag("{{FIRST}} {{FAMILY}}"), fields).last).toBe("FAMILY");
    // a packing label with both: each kept, for the division's language to choose
    expect(printedNameKeys(tag("{{HEB_FIRST}} {{HEB_LAST}} {{LAST}}, {{FIRST}}"), fields)).toEqual({ last: "LAST", first: "FIRST", hebLast: "HEB_LAST", hebFirst: "HEB_FIRST" });
    expect(printedNameKeys(tag("{{MOTHER_FIRST}}"), fields)).toEqual({ last: "LAST", first: "FIRST", hebLast: "HEB_LAST", hebFirst: "HEB_FIRST" });
  });

  it("Hebrew names first in a Hebrew division, then the rest", async () => {
    const { byBunkThenName } = await import("../data");
    const c = (last_name: string, heb: boolean) => ({ first_name: "", last_name, division_name: "Hebrew Division", bunk_name: "Bunk א", heb }) as never;
    const rows = [c("שוורץ", true), c("Aaron", false), c("אברהמי", true)];
    expect([...rows].sort(byBunkThenName).map((x: { last_name: string }) => x.last_name)).toEqual(["אברהמי", "שוורץ", "Aaron"]);
  });
});
