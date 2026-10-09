import { describe, expect, it } from "vitest";
import { formatTime, formatWhen } from "../utils";

describe("camp time", () => {
  it("shows camp time, not the server's", () => {
    // 13:42 UTC in July is 9:42 in New York
    expect(formatTime("2026-07-01T13:42:00Z")).toBe("9:42 AM");
  });
  it("says the day when it isn't today", () => {
    const now = new Date("2026-07-03T15:00:00Z");
    expect(formatWhen("2026-07-03T13:42:00Z", now)).toBe("9:42 AM");
    expect(formatWhen("2026-07-01T13:42:00Z", now)).toBe("Wed 9:42 AM");
    expect(formatWhen("2026-06-01T13:42:00Z", now)).toBe("Jun 1, 9:42 AM");
  });
});

import { startOfCampDay } from "../print/batch";
describe("startOfCampDay", () => {
  it("is midnight in camp time", () => {
    expect(startOfCampDay(new Date("2026-07-03T15:00:00Z"))).toBe("2026-07-03T04:00:00.000Z");
    // 1am UTC is still the previous evening in New York
    expect(startOfCampDay(new Date("2026-07-04T01:00:00Z"))).toBe("2026-07-03T04:00:00.000Z");
    expect(startOfCampDay(new Date("2026-01-10T12:00:00Z"))).toBe("2026-01-10T05:00:00.000Z");
  });
});

import { campDateTimeToIso } from "../time";
describe("campDateTimeToIso", () => {
  it("reads a camp wall-clock time, summer and winter", () => {
    expect(campDateTimeToIso("2026-07-01", "16:30")).toBe("2026-07-01T20:30:00.000Z");
    expect(campDateTimeToIso("2026-12-01", "09:00")).toBe("2026-12-01T14:00:00.000Z");
  });
});
