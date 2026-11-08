import { describe, expect, it } from "vitest";
import { RATES, textUsage } from "../usage";

describe("text usage", () => {
  const now = new Date("2026-11-08T18:00:00Z");
  const today = new Date("2026-11-08T05:00:00Z");
  it("counts billed texts by segment, failed ones apart, replies too, in each window", () => {
    const long = "x".repeat(200); // 2 segments
    const u = textUsage(
      [
        { at: "2026-11-08T12:00:00Z", body: "Hi", billed: true },
        { at: "2026-11-08T12:00:00Z", body: long, billed: true },
        { at: "2026-11-08T12:00:00Z", body: "Hi", billed: false },
        { at: "2026-11-04T12:00:00Z", body: "שלום", billed: true },
        { at: "2026-10-01T12:00:00Z", body: "Old", billed: true },
      ],
      [{ at: "2026-11-08T13:00:00Z", body: "Thanks" }],
      today,
      now,
    );
    expect(u.today).toMatchObject({ texts: 2, segments: 3, failed: 1, replies: 1, replySegments: 1 });
    expect(u.week).toMatchObject({ texts: 3, segments: 4 });
    expect(u.all).toMatchObject({ texts: 4, segments: 5 });
    expect(u.today.cost).toBeCloseTo(3 * (RATES.twilio + RATES.carrierOut) + (RATES.twilio + RATES.carrierIn));
    expect(u.since).toBe("2026-10-01T12:00:00Z");
  });
});
