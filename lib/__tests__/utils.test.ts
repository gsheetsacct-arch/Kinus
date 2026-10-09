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
