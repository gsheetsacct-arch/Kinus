import { describe, expect, it } from "vitest";
import { renderDocument } from "../render";
import type { TemplateSpec } from "../types";

const layers: TemplateSpec["layers"] = [
  { id: "f", type: "text", text: "FRONT {{N}}", x: 1, y: 1, w: 40, h: 8, size: 10 },
  { id: "b", type: "text", text: "BACK {{N}}", x: 1, y: 1, w: 40, h: 8, size: 10, side: "back" },
];
// 2 across, 1 down on Letter (215.9 mm wide): labels 80 mm wide at 20 and 110
const spec = (back: TemplateSpec["back"]): TemplateSpec => ({
  name: "t",
  kind: "name_tag",
  page_width_mm: 80,
  page_height_mm: 50,
  layers,
  back,
  sheet_layout: { paper: "letter", cols: 2, rows: 1, leftMm: 20, topMm: 10, pitchXMm: 90, pitchYMm: 50 },
});
const items = ["A", "B", "C"].map((N) => ({ values: { N }, copies: 1 }));
const pages = (html: string) => html.split("<body>")[1].split('<div class="sheet').slice(1);
const spots = (page: string) => [...page.matchAll(/left:([\d.-]+)mm;top:([\d.-]+)mm;[^>]*>(?:<div[^>]*><span[^>]*>)?([A-Z]+ [A-Z])/g)].map((m) => `${m[3]}@${m[1]},${m[2]}`);

describe("two-sided templates", () => {
  it("one side: no back parts, no back pages", () => {
    const html = renderDocument(spec(null), items);
    expect(html).not.toContain("BACK");
    expect(pages(html)).toHaveLength(2);
  });
  it("each sheet is followed by its back, mirrored left to right (long edge)", () => {
    const p = pages(renderDocument(spec({ flip: "long" }), items));
    expect(p).toHaveLength(4);
    expect(spots(p[0])).toEqual(["FRONT A@20.00,10.00", "FRONT B@110.00,10.00"]);
    // 215.9 − 20 − 80 = 115.9: A's back is behind A, on the right as seen from the back
    expect(spots(p[1])).toEqual(["BACK A@115.90,10.00", "BACK B@25.90,10.00"]);
    expect(spots(p[3])).toEqual(["BACK C@115.90,10.00"]);
  });
  it("short edge: top and bottom swap; the back nudge moves the back only", () => {
    const p = pages(renderDocument(spec({ flip: "short", shiftXMm: 1, shiftYMm: -0.5 }), items));
    expect(spots(p[0])[0]).toBe("FRONT A@20.00,10.00");
    // 279.4 − 10 − 50 = 219.4
    expect(spots(p[1])).toEqual(["BACK A@21.00,218.90", "BACK B@111.00,218.90"]);
  });
  it("a used label on a part-used sheet has no back", () => {
    const p = pages(renderDocument(spec({ flip: "long" }), items.slice(0, 1), { usedSlots: [1] }));
    expect(spots(p[0])).toEqual(["FRONT A@110.00,10.00"]);
    expect(spots(p[1])).toEqual(["BACK A@25.90,10.00"]);
  });
  it("one tag a page: front, then back", () => {
    const html = renderDocument({ ...spec({ flip: "long" }), sheet_layout: null }, items.slice(0, 2));
    const order = [...html.split("<body>")[1].matchAll(/(FRONT|BACK) ([AB])/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(order).toEqual(["FRONT A", "BACK A", "FRONT B", "BACK B"]);
  });
});
