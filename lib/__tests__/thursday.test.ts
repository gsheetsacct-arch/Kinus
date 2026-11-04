import { describe, expect, it } from "vitest";
import { thursdayCamp, thursdayCopy, thursdayOf, hasThursdayColumns } from "../import/thursday";
import { pictureFor } from "../print/types";
import type { ParsedCamper } from "../import/mapping";

const row = (yes: string, group: string, bunk = "") => ({ "students.id": "77", "ppa.thursday_program_yes_no": yes, "group_types.thursday": group, "group_types.thursday_bunks": bunk });

describe("the Thursday Program in the export", () => {
  it("knows the file has it", () => {
    expect(hasThursdayColumns(["students.id", "group_types.thursday"])).toBe(true);
    expect(hasThursdayColumns(["students.id"])).toBe(false);
  });
  it("puts campers with a Thursday group in it", () => {
    expect(thursdayOf(row("Yes", "Thursday Program - English"))).toEqual({ division: "Thursday Program - English", bunk: null });
    expect(thursdayOf(row("כן", "Thursday Program - Hebrew", "Bunk 3"))).toEqual({ division: "Thursday Program - Hebrew", bunk: "Bunk 3" });
  });
  it("leaves out No, and says why when the two columns disagree", () => {
    expect(thursdayOf(row("No", ""))).toBeNull();
    expect(thursdayOf(row("לא", ""))).toBeNull();
    expect(thursdayOf(row("No", "Thursday Program - English"))).toHaveProperty("skip");
    expect(thursdayOf(row("Yes", ""))).toHaveProperty("skip");
  });
  it("each language has its Thursday camp", () => {
    expect(thursdayCamp("Thursday Program - English")).toBe("Thursday American");
    expect(thursdayCamp("Thursday Program - French")).toBe("Thursday French");
    expect(thursdayCamp("Thursday Program - Hebrew")).toBe("Thursday Hebrew");
    expect(thursdayCamp("Division 1")).toBeNull();
  });
  it("the Thursday record has its own id and place", () => {
    const parsed = { source_id: "77", first_name: "A", last_name: "B", division_name: "Division 2", bunk_name: "Bunk Alef", division_candidates: ["Division 2"], bunk_candidates: ["Bunk Alef"], contacts: [], source_data: {}, warnings: [] } as unknown as ParsedCamper;
    const copy = thursdayCopy(parsed, { division: "Thursday Program - English", bunk: null });
    expect(copy).toMatchObject({ source_id: "thursday:77", division_name: "Thursday Program - English", bunk_name: null });
    expect(parsed.division_name).toBe("Division 2");
  });
  it("a Thursday division takes the Thursday Program picture", () => {
    const part = { path: "default.png", byDivision: { "Thursday Program": "thursday.png", "Division 1": "d1.png" } };
    expect(pictureFor(part, "Thursday Program - French")).toBe("thursday.png");
    expect(pictureFor(part, "Division 1")).toBe("d1.png");
    expect(pictureFor(part, "Division 9")).toBe("default.png");
  });
});

describe("a file just for the Thursday Program's bunks", () => {
  it("is known by its Thursday bunk column without the regular bunk columns", async () => {
    const { isThursdayOnlyFile } = await import("../import/thursday");
    expect(isThursdayOnlyFile(["students.id", "students.first_name", "group_types.division", "group_types.thursday_bunks"])).toBe(true);
    expect(isThursdayOnlyFile(["students.id", "group_types.bunks", "group_types.thursday", "group_types.thursday_bunks"])).toBe(false);
    expect(isThursdayOnlyFile(["students.id", "group_types.bunks"])).toBe(false);
  });
  it("a number is Bunk <number>", async () => {
    const { thursdayBunk } = await import("../import/thursday");
    expect(thursdayBunk("3")).toBe("Bunk 3");
    expect(thursdayBunk("Bunk Alef")).toBe("Bunk Alef");
    expect(thursdayBunk(null)).toBeNull();
  });
});
