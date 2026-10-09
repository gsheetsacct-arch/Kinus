import { describe, expect, it } from "vitest";
import { campClock, missingStates, type Followup } from "../missing";
import type { CamperStatus } from "../machine";

const bunk = (id: string, statuses: CamperStatus[]) => statuses.map((status, i) => ({ id: `${id}${i}`, divisionId: "d", bunkId: id, status }));
const now = new Date("2026-07-01T15:00:00Z");
const none = new Map<string, Followup>();

describe("missingStates", () => {
  it("flags stragglers once most of the bunk is here", () => {
    const rows = [...bunk("a", ["present", "present", "present", "expected"]), ...bunk("b", ["present", "expected", "expected", "expected"])];
    const s = missingStates(rows, { percent: 75, after_time: null }, none, now, "11:00");
    expect(s.get("a3")).toEqual({ kind: "check", reason: "3 of 4 in their bunk are here" });
    expect(s.get("b1")).toEqual({ kind: "waiting" });
  });
  it("counts campers who went out or home as arrived, and leaves no-shows out", () => {
    const rows = bunk("a", ["out", "departed", "no_show", "expected"]);
    expect(missingStates(rows, { percent: 60, after_time: null }, none, now, "11:00").get("a3")?.kind).toBe("check");
  });
  it("flags everyone after the cut-off time, but not before anyone has arrived", () => {
    const rows = bunk("a", ["present", "expected", "expected", "expected", "expected"]);
    const rules = { percent: 0, after_time: "10:30" };
    expect(missingStates(rows, rules, none, now, "10:29").get("a1")?.kind).toBe("waiting");
    expect(missingStates(rows, rules, none, now, "10:30").get("a1")).toEqual({ kind: "check", reason: "Still not here after 10:30" });
    expect(missingStates(bunk("b", ["expected"]), rules, none, now, "23:00").get("b0")?.kind).toBe("waiting");
  });
  it("pauses the flag while someone is coming later, and flags again after", () => {
    const rows = bunk("a", ["present", "present", "present", "expected"]);
    const later = new Map([["a3", { until: "2026-07-01T17:00:00Z", note: "after lunch", by: "Sarah", at: "" }]]);
    expect(missingStates(rows, { percent: 75, after_time: null }, later, now, "11:00").get("a3")).toEqual({ kind: "later", until: "2026-07-01T17:00:00Z" });
    const after = new Date("2026-07-01T18:00:00Z");
    expect(missingStates(rows, { percent: 0, after_time: null }, later, after, "14:00").get("a3")).toEqual({ kind: "check", reason: "Was coming later, still not here" });
  });
  it("only looks at campers still expected", () => {
    expect(missingStates(bunk("a", ["present", "no_show"]), { percent: 1, after_time: null }, none, now, "11:00").size).toBe(0);
  });
});

describe("campClock", () => {
  it("is 24-hour camp time", () => {
    expect(campClock(new Date("2026-07-01T18:05:00Z"), "America/New_York")).toBe("14:05");
  });
});
