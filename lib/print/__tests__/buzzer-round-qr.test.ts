import { describe, expect, it } from "vitest";
import { buzzerQuery, formatBuzzer } from "@/lib/buzzer-format";
import { getFieldValue } from "@/lib/fields";
import { qrRoundSvg } from "../barcode";
import { tintCode } from "../code-color";
import { renderDocument } from "../render";

describe("buzzer numbers", () => {
  it("print as three digits", () => {
    expect(formatBuzzer(1)).toBe("001");
    expect(formatBuzzer(728)).toBe("728");
    expect(formatBuzzer(1234)).toBe("1234");
    expect(formatBuzzer(null)).toBe("");
  });
  it("a search that's a number looks for a buzzer too", () => {
    expect(buzzerQuery("7")).toBe(7);
    expect(buzzerQuery(" 007 ")).toBe(7);
    expect(buzzerQuery("#12")).toBe(12);
    expect(buzzerQuery("134841")).toBeNull();
    expect(buzzerQuery("Levi")).toBeNull();
  });
  it("is a camper field", () => {
    expect(getFieldValue({ current_buzzer_number: 5 } as never, "buzzer")).toBe("005");
    expect(getFieldValue({ current_buzzer_number: null } as never, "buzzer")).toBeNull();
  });
});

describe("round QR", () => {
  it("is the same for the same text, and different for another", () => {
    expect(qrRoundSvg("KN134841")).toBe(qrRoundSvg("KN134841"));
    expect(qrRoundSvg("KN134841")).not.toBe(qrRoundSvg("KN100016"));
  });
  it("a circle on a white disc, coloured like the square one", () => {
    const svg = qrRoundSvg("KN1");
    expect(svg).toMatch(/<clipPath id="rq[a-z0-9]+"><circle/);
    expect(svg).toContain('fill="#ffffff"');
    expect(tintCode(svg, "#14532d")).toMatch(/<path fill="#14532d" clip-path=/);
    expect(qrRoundSvg("")).toBe("");
  });
  it("prints when a QR part is round", () => {
    const html = renderDocument(
      { name: "t", kind: "other", page_width_mm: 38.1, page_height_mm: 38.1, sheet_layout: null, layers: [{ id: "q", type: "qr", text: "{{BARCODE}}", x: 5, y: 5, w: 28, h: 28, shape: "round" }] },
      [{ values: { BARCODE: "KN134841" }, copies: 1 }],
    );
    expect(html).toContain(qrRoundSvg("KN134841").replace("<svg ", '<svg preserveAspectRatio="xMidYMid meet" '));
  });
});
