import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { laterStatus, optKeyword, pickRecipients, smsSegments, type TextRecipient } from "../sms";
import { validTwilioSignature } from "../twilio";

const person = (key: string, o: Partial<TextRecipient> = {}): TextRecipient => ({ key, profileId: key, name: key, phone: `+1718555${key.padStart(4, "0").slice(-4)}`, divisionIds: [], optedOut: false, signup: false, ...o });

describe("who a staff text goes to", () => {
  const all = [
    person("1", { divisionIds: ["d1"] }),
    person("2", { divisionIds: ["d1", "d2"] }),
    person("3", { divisionIds: ["d2"] }),
    person("4", { divisionIds: ["d1"], phone: null }),
    person("5", { divisionIds: ["d2"], optedOut: true }),
    person("director", { divisionIds: [] }),
    person("signup", { profileId: null, signup: true, phone: person("1").phone }),
    person("signup2", { profileId: null, signup: true }),
  ];
  it("a division: its staff only, without directors or sign-ups", () => {
    const { to, skipped } = pickRecipients(all, ["d1"]);
    expect(to.map((r) => r.key)).toEqual(["1", "2"]);
    expect(skipped.map((r) => [r.key, r.why])).toEqual([["4", "no phone"]]);
  });
  it("two divisions: someone in both gets it once", () => {
    expect(pickRecipients(all, ["d1", "d2"]).to.map((r) => r.key)).toEqual(["1", "2", "3"]);
  });
  it("everyone: directors and sign-ups too, one text per number, never someone who replied STOP", () => {
    const { to, skipped } = pickRecipients(all, null);
    expect(to.map((r) => r.key)).toEqual(["1", "2", "3", "director", "signup2"]);
    expect(skipped.find((s) => s.key === "5")?.why).toBe("opted out");
  });
});

describe("text length", () => {
  it("counts plain texts 160 a text, then 153 a part", () => {
    expect(smsSegments("a".repeat(160))).toMatchObject({ segments: 1, unicode: false });
    expect(smsSegments("a".repeat(161)).segments).toBe(2);
    expect(smsSegments("€".repeat(80))).toMatchObject({ segments: 1, length: 160 });
  });
  it("counts Hebrew and emoji 70 a text, then 67", () => {
    expect(smsSegments("שלום".repeat(17))).toMatchObject({ segments: 1, unicode: true });
    expect(smsSegments("ש".repeat(71)).segments).toBe(2);
  });
});

describe("replies", () => {
  it("knows the opt-out and opt-in words", () => {
    expect(optKeyword(" stop ")).toBe("stop");
    expect(optKeyword("Unsubscribe")).toBe("stop");
    expect(optKeyword("START")).toBe("start");
    expect(optKeyword("help")).toBe("help");
    expect(optKeyword("stop texting me about the bus")).toBeNull();
  });
  it("a delivery report never goes back to an earlier status", () => {
    expect(laterStatus("queued", "sent")).toBe(true);
    expect(laterStatus("sent", "delivered")).toBe(true);
    expect(laterStatus("delivered", "sent")).toBe(false);
    expect(laterStatus("delivered", "failed")).toBe(false);
    expect(laterStatus("queued", "nonsense")).toBe(false);
  });
});

describe("Twilio's signature", () => {
  const token = "12345";
  const url = "https://kinus.example/api/twilio/status?r=abc";
  const params = { MessageSid: "SM1", MessageStatus: "delivered", To: "+17185550100" };
  const sign = (u: string, p: Record<string, string>) =>
    createHmac("sha1", token)
      .update(u + Object.keys(p).sort().map((k) => k + p[k]).join(""))
      .digest("base64");
  it("accepts Twilio's own, and nothing changed", () => {
    expect(validTwilioSignature(token, url, params, sign(url, params))).toBe(true);
    expect(validTwilioSignature(token, url, { ...params, MessageStatus: "failed" }, sign(url, params))).toBe(false);
    expect(validTwilioSignature(token, url, params, null)).toBe(false);
    expect(validTwilioSignature("other", url, params, sign(url, params))).toBe(false);
  });
});
