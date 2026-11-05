import { describe, expect, it } from "vitest";
import { campClock, campNow, missingStates, rulesByDivision, type Followup } from "../missing";
import type { CamperStatus } from "../machine";

const bunk = (id: string, statuses: CamperStatus[], divisionId = `d-${id}`) => statuses.map((status, i) => ({ id: `${id}${i}`, divisionId, bunkId: id, status }));
const now = new Date("2026-07-01T15:00:00Z");
const none = new Map<string, Followup>();

describe("missingStates", () => {
  it("flags stragglers once most of the division is here", () => {
    const rows = [...bunk("a", ["present", "present", "present", "expected"]), ...bunk("b", ["present", "expected", "expected", "expected"])];
    const s = missingStates(rows, { percent: 75, after_time: null }, none, now, "11:00");
    expect(s.get("a3")).toEqual({ kind: "check", reason: "3 of 4 in their division have arrived" });
    expect(s.get("b1")).toEqual({ kind: "waiting" });
  });
  it("measures the whole division, not the bunk", () => {
    // bunk a is all here but bunk b barely: 4 of 8 in the division is 50%
    const rows = [...bunk("a", ["present", "present", "present", "expected"], "d1"), ...bunk("b", ["present", "expected", "expected", "expected"], "d1")];
    const s = missingStates(rows, { percent: 75, after_time: null }, none, now, "11:00");
    expect(s.get("a3")).toEqual({ kind: "waiting" });
    expect(missingStates(rows, { percent: 50, after_time: null }, none, now, "11:00").get("b1")).toEqual({ kind: "check", reason: "4 of 8 in their division have arrived" });
  });
  it("uses the whole division's count when only part of it is on screen", () => {
    // a counselor sees their own bunk (all late); the rest of the division is mostly here
    const rows = bunk("a", ["expected", "expected"], "d1");
    const counts = { d1: { total: 40, arrived: 36 } };
    expect(missingStates(rows, { percent: 75, after_time: null }, none, now, "11:00").get("a0")?.kind).toBe("waiting");
    expect(missingStates(rows, { percent: 75, after_time: null }, none, now, "11:00", true, counts).get("a0")).toEqual({ kind: "check", reason: "36 of 40 in their division have arrived" });
    // the whole division on screen: counted live (newer than the server's count)
    const all = bunk("a", ["present", "present", "present", "expected"], "d1");
    expect(missingStates(all, { percent: 75, after_time: null }, none, now, "11:00", true, { d1: { total: 4, arrived: 0 } }).get("a3")?.kind).toBe("check");
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

describe("campStarted", () => {
  it("flags a bunk that's entirely late once camp has started elsewhere", () => {
    const rows = bunk("late", ["expected", "expected"]);
    const rules = { percent: 75, after_time: "10:00" };
    expect(missingStates(rows, rules, none, now, "11:00").get("late0")?.kind).toBe("waiting");
    expect(missingStates(rows, rules, none, now, "11:00", true).get("late0")).toEqual({ kind: "check", reason: "Still not here after 10:00" });
    expect(missingStates(rows, rules, none, now, "11:00", false).get("late0")?.kind).toBe("waiting");
  });
  it("treats a camper missing since an earlier camp day as past the cut-off all day", () => {
    const rules = { percent: 0, after_time: "10:30" };
    const rows = bunk("a", ["present", "expected"]);
    expect(missingStates(rows, rules, none, now, "08:00", true).get("a1")?.kind).toBe("waiting");
    expect(missingStates(rows, rules, none, now, "08:00", "earlier").get("a1")).toEqual({ kind: "check", reason: "Still not here since camp started" });
  });

  it("a dated cut-off: from that moment on, even before anyone arrived", () => {
    const rows = bunk("a", ["expected", "expected"]);
    const rules = { percent: 0, after_time: "10:30", after_date: "2026-11-03" };
    expect(missingStates(rows, rules, none, now, "2026-11-03 10:29", false).get("a0")?.kind).toBe("waiting");
    expect(missingStates(rows, rules, none, now, "2026-11-03 10:30", false).get("a0")).toEqual({ kind: "check", reason: "Still not here after Nov 3 10:30" });
    expect(missingStates(rows, rules, none, now, "2026-11-04 08:00", true).get("a0")?.kind).toBe("check");
    expect(missingStates(rows, rules, none, now, "2026-11-02 23:00", true).get("a0")?.kind).toBe("waiting");
  });
  it("a camp's or division's own rule: the division's beats its camp's, which beats the general one", () => {
    const by = rulesByDivision(
      [
        { key: "camp:hebrew", percent: 0, after_time: "09:00", after_date: "2026-11-04" },
        { key: "div:d-b", percent: 50, after_time: null, after_date: null },
      ],
      [
        { id: "d-a", group_id: null },
        { id: "d-b", group_id: "hebrew" },
        { id: "d-c", group_id: "hebrew" },
      ],
      "american",
    );
    expect(by).toEqual({ "d-b": { percent: 50, after_time: null, after_date: null }, "d-c": { percent: 0, after_time: "09:00", after_date: "2026-11-04" } });
    const rules = { percent: 90, after_time: null, after_date: null, byDivision: by };
    const rows = [...bunk("a", ["present", "expected"]), ...bunk("b", ["present", "expected"]), ...bunk("c", ["expected"])];
    const s = missingStates(rows, rules, none, now, "2026-11-04 09:30", true);
    expect(s.get("a1")?.kind).toBe("waiting"); // the general 90%: half isn't enough
    expect(s.get("b1")?.kind).toBe("check"); // its division: 50%
    expect(s.get("c0")).toEqual({ kind: "check", reason: "Still not here after Nov 4 09:00" }); // its camp's dated cut-off
  });
  it("camp time now, with the day", () => {
    expect(campNow(new Date("2026-11-05T03:05:00Z"), "America/New_York")).toBe("2026-11-04 22:05");
  });
});
