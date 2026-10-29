import { describe, expect, it } from "vitest";
import { camperFlags, flagsFor, parseFlags } from "../camper-flags";

describe("camper flags", () => {
  it("reads medical, EpiPen, notes, coming later and no bunk", () => {
    expect([...camperFlags({ has_medical_flag: true, bunk_id: "b", status: "present" }, false)]).toEqual(["medical"]);
    expect([...camperFlags({ has_epipen: true, bunk_id: "b" }, false)]).toEqual(["medical", "epipen"]);
    expect([...camperFlags({ medical_notes: " asthma ", bunk_id: "b" }, false)]).toEqual(["medical"]);
    expect([...camperFlags({ notes_from_parents: "", staff_notes: "picks up early", bunk_id: "b" }, false)]).toEqual(["notes"]);
    expect([...camperFlags({ bunk_id: null, status: "expected" }, true)]).toEqual(["later", "no_bunk"]);
    // here already: no longer coming later
    expect(camperFlags({ bunk_id: "b", status: "present" }, true).has("later")).toBe(false);
  });

  it("offers only the filters someone can see", () => {
    expect(flagsFor(new Set())).toEqual(["medical", "later", "no_bunk"]);
    expect(flagsFor(new Set(["medical", "staff_notes"]))).toEqual(["medical", "epipen", "notes", "later", "no_bunk"]);
  });

  it("reads them from the address bar", () => {
    expect(parseFlags("medical,nope,later,medical")).toEqual(["medical", "later"]);
    expect(parseFlags(null)).toEqual([]);
  });
});
