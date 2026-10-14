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
  it("says Tomorrow for a time tomorrow at camp", () => {
    // 11 pm in New York; 9 am tomorrow
    const now = new Date("2026-07-04T03:00:00Z");
    expect(formatWhen("2026-07-04T13:00:00Z", now)).toBe("Tomorrow 9:00 AM");
    // 1 am UTC is still the evening before at camp: 8 pm that evening is "today"
    expect(formatWhen("2026-07-04T00:00:00Z", new Date("2026-07-03T22:00:00Z"))).toBe("8:00 PM");
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
  it("gets the days the clocks change right", () => {
    // spring forward (8 Mar 2026, 2 am → 3 am): 3:30 am is already daylight time
    expect(campDateTimeToIso("2026-03-08", "03:30")).toBe("2026-03-08T07:30:00.000Z");
    expect(campDateTimeToIso("2026-03-08", "01:30")).toBe("2026-03-08T06:30:00.000Z");
    // fall back (1 Nov 2026): noon is standard time
    expect(campDateTimeToIso("2026-11-01", "12:00")).toBe("2026-11-01T17:00:00.000Z");
  });
});
