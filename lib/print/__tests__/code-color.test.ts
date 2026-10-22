import { describe, expect, it } from "vitest";
import { codeContrast, MIN_CODE_CONTRAST, tintCode } from "../code-color";
import { code128Svg, qrSvg } from "../barcode";
import { renderDocument } from "../render";

describe("coloured codes", () => {
  it("paints barcode bars and QR squares", () => {
    expect(tintCode(code128Svg("KN100016"), "#1e3a8a")).toContain('stroke="#1e3a8a"');
    expect(tintCode(code128Svg("KN100016"), "#1e3a8a")).not.toContain("#000000");
    const qr = tintCode(qrSvg("KN100016"), "#14532d");
    expect(qr).toMatch(/<path fill="#14532d" d=/);
  });
  it("black, nothing or a bad value: unchanged", () => {
    const svg = qrSvg("x");
    expect(tintCode(svg, undefined)).toBe(svg);
    expect(tintCode(svg, "#000000")).toBe(svg);
    expect(tintCode(svg, "red; x")).toBe(svg);
  });
  it("too light to scan", () => {
    expect(codeContrast("#000000")).toBeCloseTo(21, 0);
    expect(codeContrast("#1e3a8a")).toBeGreaterThan(MIN_CODE_CONTRAST);
    expect(codeContrast("#fbbf24")).toBeLessThan(MIN_CODE_CONTRAST);
  });
  it("prints in the colour, number under the bars too", () => {
    const html = renderDocument(
      { name: "t", kind: "name_tag", page_width_mm: 60, page_height_mm: 30, sheet_layout: null, layers: [
        { id: "b", type: "barcode", text: "KN100016", x: 0, y: 0, w: 50, h: 12, color: "#1e3a8a" },
        { id: "q", type: "qr", text: "KN100016", x: 0, y: 14, w: 14, h: 14, color: "#14532d" },
      ] },
      [{ values: {}, copies: 1 }],
    );
    expect(html).toContain('stroke="#1e3a8a"');
    expect(html).toContain('class="bc-text" style="color:#1e3a8a"');
    expect(html).toContain('<path fill="#14532d"');
  });
});
