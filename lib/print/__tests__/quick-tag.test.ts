import { describe, expect, it } from "vitest";
import { cleanQuickTag, quickTagSpec } from "../quick-tag";

describe("quick staff tag", () => {
  it("prints typed text as typed: no fields, one line, not too long", () => {
    const t = cleanQuickTag({ name: "  Leibel   {{LAST}} Kramer ", top: "x".repeat(50) });
    expect(t.name).toBe("Leibel LAST Kramer");
    expect(t.top).toHaveLength(30);
    expect(t.qr).toBe("");
  });
  it("adds the QR code only with a link, and leaves out empty lines", () => {
    const plain = quickTagSpec(cleanQuickTag({ top: "STAFF", name: "Leibel Kramer", line2: "Counselor" }));
    expect(plain.layers.map((l) => l.id)).toEqual(["top", "rule", "name", "line2"]);
    const withQr = quickTagSpec(cleanQuickTag({ name: "Leibel Kramer", qr: "https://kinus.vercel.app" }), "custom:x");
    expect(withQr.layers.map((l) => l.id)).toEqual(["name", "qr"]);
    expect(withQr).toMatchObject({ page_width_mm: 50, page_height_mm: 80, thermal: true, sheet_layout: null });
    // everything stays on the tag
    for (const l of [...plain.layers, ...withQr.layers]) expect(l.y + l.h).toBeLessThanOrEqual(80);
  });
});
