import { describe, expect, it } from "vitest";
import { findFamilies, findIndex, type FindCamper } from "../find";

const c = (id: string, name: string, family: string | null, status: FindCamper["status"] = "present", buzzer: number | null = null): FindCamper => ({ id, code: `0${id}00`, name, last: name.split(" ").pop()!, family, status, buzzer });
const roster = [
  c("1", "Levi Cohen", "F1", "present", 12),
  c("2", "Mendel Cohen", "F1", "present", 13),
  c("3", "Yossi Cohen", "F2", "expected"),
  c("4", "Menachem Shapiro", "F3", "departed"),
  c("5", "Chaim Shapiro", "F3", "present", 40),
  c("6", "Dovid Cohen", null, "present"),
];
const index = findIndex(roster);

describe("final check-out: find", () => {
  it("finds the whole family from one child's name", () => {
    const g = findFamilies(index, "Levi Cohen");
    expect(g[0].members.map((m) => m.id)).toEqual(["1", "2"]);
  });
  it("puts families that never checked in last, and in a family who's here first", () => {
    const g = findFamilies(index, "cohen");
    expect(g.map((x) => x.key)).toEqual(["f:F1", "c:6", "f:F2"]);
    expect(findFamilies(index, "shapiro")[0].members.map((m) => m.id)).toEqual(["5", "4"]);
  });
  it("forgives spelling, and finds by buzzer number", () => {
    expect(findFamilies(index, "Menahem Shapiro")[0].key).toBe("f:F3");
    expect(findFamilies(index, "Chayim")[0].key).toBe("f:F3");
    expect(findFamilies(index, "40")[0].key).toBe("f:F3");
    expect(findFamilies(index, "")).toEqual([]);
  });
  it("typed in Hebrew: campers with a Hebrew name first; English finds everyone alike", () => {
    const he = findIndex([...roster, { ...c("7", "Levi Kahn", "F7", "present"), heb: "לוי כהן" }]);
    expect(findFamilies(he, "כהן")[0].key).toBe("f:F7");
    expect(findFamilies(he, "levi")[0].key).toBe("f:F1");
  });
});
