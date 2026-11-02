import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { renderCombined } from "../render";

const tag = { name: "Name tag", kind: "name_tag", page_width_mm: 50, page_height_mm: 80, sheet_layout: null, thermal: true, layers: [
  { id: "n", type: "text", text: "{{FIRST}} {{LAST}}", x: 3, y: 50, w: 44, h: 10, size: 16, align: "center", weight: 700 },
  { id: "q", type: "qr", text: "{{BARCODE}}", x: 10, y: 5, w: 30, h: 30 },
] } as never;
const bag = { name: "Bag label", kind: "luggage_tag", page_width_mm: 50, page_height_mm: 80, sheet_layout: null, thermal: true, layers: [
  { id: "a", type: "text", text: "{{FIRST}} {{LAST}}", x: 3, y: 44, w: 44, h: 10, size: 14, align: "center" },
  { id: "b", type: "text", text: "{{FIRST}} {{LAST}}", x: 3, y: 26, w: 44, h: 10, size: 14, align: "center", rotate: 180 },
  { id: "f", type: "box", x: 0, y: 39.8, w: 50, h: 0.4, fill: "#000000" },
] } as never;

describe("labels printed as sets", () => {
  it("puts each camper's labels one after another, the bottom half upside down", () => {
    const v = (FIRST: string) => ({ FIRST, LAST: "Cohen", BARCODE: "KN0001" });
    const html = renderCombined([{ spec: tag }, { spec: bag }], [{ part: 0, values: v("Ari"), copies: 1 }, { part: 1, values: v("Ari"), copies: 1 }, { part: 0, values: v("Ben"), copies: 1 }, { part: 1, values: v("Ben"), copies: 1 }]);
    expect(html).toContain("@page{size:50mm 80mm");
    expect(html.match(/class="tag"/g)?.length).toBe(4);
    expect(html.indexOf(">Ari Cohen<")).toBeLessThan(html.indexOf(">Ben Cohen<"));
    expect(html).toContain("rotate(180deg)");
    if (process.env.O) writeFileSync(process.env.O, html);
  });
  it("refuses templates of different sizes", () => {
    expect(() => renderCombined([{ spec: tag }, { spec: { ...(bag as object), page_height_mm: 60 } as never }], [])).toThrow(/different sizes/);
  });
});
