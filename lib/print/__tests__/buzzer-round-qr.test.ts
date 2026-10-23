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

describe("PDF artwork and spacing", () => {
  it("a picture made from a PDF is marked for the PDFs Kinus makes (not under a division's own picture)", () => {
    const html = renderDocument(
      { name: "t", kind: "name_tag", page_width_mm: 98, page_height_mm: 127, sheet_layout: null, layers: [
        { id: "a", type: "image", path: "pictures/x-p1.png", x: 0, y: 0, w: 98, h: 127, fit: "cover", byDivision: { "Division 2": "pictures/other.png" }, pdf: { path: "pictures/x.pdf", page: 1, box: [12, 12, 279, 360] } },
      ] },
      [{ values: { __division: "Division 1" }, copies: 1 }, { values: { __division: "Division 2" }, copies: 1 }],
    );
    expect(html.match(/data-pdf="pictures\/x.pdf" data-pdf-page="1" data-pdf-box="12,12,279,360" data-pdf-fit="cover"/g)).toHaveLength(1);
    // never data-fit (that's the text fitting's mark)
    expect(html).not.toMatch(/class="l im[^"]*"[^>]* data-fit=/);
  });
  it("letter and word spacing print in em", () => {
    const html = renderDocument(
      { name: "t", kind: "name_tag", page_width_mm: 98, page_height_mm: 127, sheet_layout: null, layers: [
        { id: "n", type: "text", text: "{{FIRST}}", x: 0, y: 0, w: 90, h: 10, size: 20, letterSpacing: 0.08, wordSpacing: 0.5 },
        { id: "c", type: "text", text: "{{FIRST}}", x: 0, y: 0, w: 38, h: 38, size: 8, curve: "top", letterSpacing: 0.1 },
      ] },
      [{ values: { FIRST: "Levi" }, copies: 1 }],
    );
    expect(html).toContain("letter-spacing:0.08em;word-spacing:0.5em;");
    expect(html).toContain('style="letter-spacing:0.1em;"');
  });
});
