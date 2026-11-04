import { describe, expect, it } from "vitest";
import { parseFile } from "../parse";
import { applyMapping } from "../mapping";
import { guessTarget } from "../default-mapping";
import { isThursdayOnlyFile, thursdayCells, thursdayRecordFor } from "../thursday";

/** A Thursday list exported from Kinus, the Thursday bunks filled in: no registration ids. */
describe("a Thursday list from Kinus with the bunks filled in", () => {
  const file = "﻿Bunk,Name,Thursday bunks,Mother name\nBunk 3,Moshe Cohen,4,Rivka\n";
  const parsed = parseFile(new TextEncoder().encode(file), "Thursday prog.csv");

  it("reads the headers without the byte-order mark, and as a Thursday-only file", () => {
    expect(parsed.headers).toEqual(["Bunk", "Name", "Thursday bunks", "Mother name"]);
    expect(isThursdayOnlyFile(parsed.headers)).toBe(true);
    expect(isThursdayOnlyFile(["ï»¿Bunk", "Thursday bunks"])).toBe(true);
    expect(thursdayCells(parsed.rows[0])).toEqual({ group: null, bunk: "4" });
  });

  it("takes Name as the full name, for matching", () => {
    expect(guessTarget("Name")).toBe("full_name");
    expect(guessTarget("Mother name")).toBeNull();
    const c = applyMapping(parsed.rows[0], { Name: "full_name" }, {});
    expect(c.first_name).toBe("Moshe Cohen");
    expect(c.full_name_only).toBe(true);
    // a file with first / last name columns keeps them
    expect(applyMapping({ Name: "X", First: "Moshe", Last: "Cohen" }, { Name: "full_name", First: "first_name", Last: "last_name" }, {}).first_name).toBe("Moshe");
  });

  const thursday = [
    { source_id: "thursday:100", first_name: "Moshe", last_name: "Cohen", division_name: "Thursday Program - English" },
    { source_id: "thursday:200", first_name: "Levi", last_name: "Katz", division_name: "Thursday Program - English" },
    { source_id: "thursday:300", first_name: "Levi", last_name: "Katz", division_name: "Thursday Program - French" },
  ];
  it("finds their Thursday record by name when there's no id", () => {
    expect(thursdayRecordFor({ source_id: null, first_name: "moshe  cohen", last_name: "" }, null, thursday)).toEqual({ id: "100", division: "Thursday Program - English" });
    expect(thursdayRecordFor({ source_id: null, first_name: "Nobody", last_name: "Here" }, null, thursday)).toBeNull();
    // two of the same name: the file's Thursday group tells them apart, else it asks for ids
    expect(thursdayRecordFor({ source_id: null, first_name: "Levi Katz", last_name: "" }, "Thursday Program - French", thursday)).toEqual({ id: "300", division: "Thursday Program - French" });
    expect(thursdayRecordFor({ source_id: null, first_name: "Levi Katz", last_name: "" }, null, thursday)).toHaveProperty("skip");
    // by id, as before
    expect(thursdayRecordFor({ source_id: "200", first_name: "", last_name: "" }, null, thursday)).toEqual({ id: "200", division: "Thursday Program - English" });
  });
});
