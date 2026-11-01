import { describe, expect, it } from "vitest";
import { camperFlags } from "../camper-flags";
import { sleepingAnswer, sleepingOf } from "../sleeping";

describe("sleeping at the Kinus", () => {
  it("reads the registration's answer, however the column is spelled, with fixes", () => {
    expect(sleepingAnswer("Yes")).toBe(true);
    expect(sleepingAnswer("No")).toBe(false);
    expect(sleepingAnswer("")).toBeNull();
    expect(sleepingOf({ "ppa.sleeping_at_the_kinus": "Yes" }, null)).toBe(true);
    expect(sleepingOf({ "PPA: Sleeping At The Kinus": "no" }, null)).toBe(false);
    expect(sleepingOf({ "ppa.sleeping_at_the_kinus": "Yes" }, { "ppa.sleeping_at_the_kinus": { value: "No" } })).toBe(false);
    expect(sleepingOf({ "ppa.city": "Brooklyn" }, null)).toBeNull();
  });
  it("is a filter: staying or going home", () => {
    expect(camperFlags({ bunk_id: "b", sleeping: true }, false).has("staying")).toBe(true);
    expect(camperFlags({ bunk_id: "b", sleeping: false }, false).has("going_home")).toBe(true);
    const unknown = camperFlags({ bunk_id: "b", sleeping: null }, false);
    expect(unknown.has("staying") || unknown.has("going_home")).toBe(false);
  });
});

describe("the list column", () => {
  it("says sleeping here or going home", async () => {
    const { sleepingText } = await import("../sleeping");
    expect([sleepingText(true), sleepingText(false), sleepingText(null)]).toEqual(["Sleeping here", "Going home", null]);
  });
});
