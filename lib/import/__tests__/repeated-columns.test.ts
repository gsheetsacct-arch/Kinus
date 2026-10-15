import { describe, expect, it } from "vitest";
import { parseFile } from "../parse";
import { sourceValues } from "../../print/merge";

const csv = (text: string) => parseFile(new TextEncoder().encode(text), "export.csv");

describe("a column name used more than once (a block per family)", () => {
  const file = csv(
    [
      "students.id,students.first_name,family.city,family.state,family.city,family.state",
      "1,Menachem,Brooklyn,NY,,",
      "2,Mendy,,,Toronto,ON",
      "3,Levi,Montreal,QC,Paris,",
    ].join("\n"),
  );
  it("keeps the first copy that's filled in under the plain name", () => {
    expect(file.rows.map((r) => r["family.city"])).toEqual(["Brooklyn", "Toronto", "Montreal"]);
    expect(file.rows.map((r) => r["family.state"])).toEqual(["NY", "ON", "QC"]);
  });
  it("keeps every copy, numbered, and says which names repeat", () => {
    expect(file.headers).toEqual(["students.id", "students.first_name", "family.city", "family.state", "family.city (2)", "family.state (2)"]);
    expect(file.rows[2]["family.city (2)"]).toBe("Paris");
    expect(file.repeatedColumns).toEqual(["family.city", "family.state"]);
  });
  it("leaves files without repeats as they were", () => {
    const plain = csv("students.id,family.city\n1,Brooklyn");
    expect(plain.rows[0]).toEqual({ "students.id": "1", "family.city": "Brooklyn" });
    expect(plain.repeatedColumns).toEqual([]);
  });
});

describe("export columns on labels", () => {
  it("are found with or without source., and a filled-in copy wins", () => {
    const get = sourceValues({ first_name: "A", last_name: "B", source_data: { "family#city": "", "family.city": "Brooklyn" } } as never);
    expect(get("source.family.city")).toBe("Brooklyn");
    expect(get("family.city")).toBe("Brooklyn");
    expect(get("family.country")).toBe("");
  });
});
