import { describe, expect, it } from "vitest";
import { RATES, billedFrom, textUsage } from "../usage";

describe("text usage", () => {
  const now = new Date("2026-11-08T18:00:00Z");
  const today = new Date("2026-11-08T05:00:00Z");
  it("counts billed texts by segment, failed ones apart, replies too, in each window, with a low–high cost", () => {
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
    expect(u.today.cost.min).toBeCloseTo(3 * (RATES.twilio[0] + RATES.carrierOut[0]) + (RATES.twilio[0] + RATES.carrierIn[0]));
    expect(u.today.cost.max).toBeCloseTo(3 * (RATES.twilio[1] + RATES.carrierOut[1]) + (RATES.twilio[1] + RATES.carrierIn[1]));
    expect(u.today.cost.max).toBeGreaterThan(u.today.cost.min);
    expect(u.since).toBe("2026-10-01T12:00:00Z");
  });
  it("reads Twilio's bill from its usage records", () => {
    const b = billedFrom([
      { category: "sms-outbound", count: "40", usage: "52", price: "0.43" },
      { category: "sms-inbound", count: "5", usage: "5", price: "0.04" },
      { category: "sms-messages-carrierfees", count: "45", usage: "45", price: "0.15" },
      { category: "totalprice", count: "0", usage: "1.77", price: "1.77" },
    ]);
    expect(b).toEqual({ sent: 40, sentSegments: 52, received: 5, sms: 0.62, total: 1.77 });
  });
});
