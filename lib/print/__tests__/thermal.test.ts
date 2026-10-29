import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ink, thermalLayers, thermalValues, turnsOnPage } from "../thermal";
import { renderDocument } from "../render";
import type { Layer, TemplateSpec } from "../types";

describe("thermal printers: black and white only", () => {
  it("every colour prints as black or white, whichever it's closer to", () => {
    expect(ink("#111111")).toBe("#000000");
    expect(ink("#2563eb")).toBe("#000000"); // division blue
    expect(ink("#16a34a")).toBe("#000000"); // green
    expect(ink("#555555")).toBe("#000000");
    expect(ink("#facc15")).toBe("#ffffff"); // yellow
    expect(ink("#cbd5e1")).toBe("#ffffff"); // light grey
    expect(ink("#fff")).toBe("#ffffff");
    expect(ink("white")).toBe("#ffffff");
    expect(ink("transparent")).toBe("transparent");
    expect(ink("#00000010")).toBe("transparent");
    expect(ink(undefined)).toBe("#000000");
  });

  it("text, blocks and codes turn; a division colour is turned per tag", () => {
    const layers: Layer[] = [
      { id: "t", type: "text", text: "{{FIRST}}", x: 0, y: 0, w: 10, h: 5, size: 12, color: "#64748b" },
      { id: "w", type: "text", text: "{{DIVISION}}", x: 0, y: 0, w: 10, h: 5, size: 12, color: "#f8fafc" },
      { id: "b", type: "box", x: 0, y: 0, w: 10, h: 5, fill: "{{DIVISION_COLOR}}", border: "#94a3b8" },
      { id: "q", type: "qr", text: "{{BARCODE}}", x: 0, y: 0, w: 10, h: 10, color: "#1e3a8a" },
      { id: "i", type: "image", path: "pictures/logo.png", x: 0, y: 0, w: 10, h: 10, pdf: { path: "pictures/logo.pdf", page: 1, box: [0, 0, 10, 10] } },
    ];
    const [t, w, b, q, i] = thermalLayers(layers) as [Extract<Layer, { type: "text" }>, Extract<Layer, { type: "text" }>, Extract<Layer, { type: "box" }>, Extract<Layer, { type: "qr" }>, Extract<Layer, { type: "image" }>];
    // a mid-grey border was meant to be seen: it prints black
    expect([t.color, w.color, b.fill, b.border, q.color]).toEqual(["#000000", "#ffffff", "{{DIVISION_COLOR}}", "#000000", "#000000"]);
    expect(i.pdf).toBeUndefined();
    expect(thermalValues([{ values: { DIVISION_COLOR: "#2563eb", FIRST: "#1 fan" }, copies: 1 }])[0].values).toEqual({ DIVISION_COLOR: "#000000", FIRST: "#1 fan" });
  });

  it("a label wider than tall goes on a page turned the way the printer feeds it", () => {
    expect(turnsOnPage({ thermal: true, sheet_layout: null, page_width_mm: 152.4, page_height_mm: 101.6 })).toBe(true);
    expect(turnsOnPage({ thermal: true, sheet_layout: null, page_width_mm: 101.6, page_height_mm: 152.4 })).toBe(false);
    expect(turnsOnPage({ thermal: false, sheet_layout: null, page_width_mm: 152.4, page_height_mm: 101.6 })).toBe(false);
    expect(turnsOnPage({ thermal: true, sheet_layout: { paper: "letter", cols: 1, rows: 2 }, page_width_mm: 152.4, page_height_mm: 101.6 })).toBe(false);
  });

  const tag = (w: number, h: number, thermal: boolean): TemplateSpec => ({
    name: "4×6",
    kind: "luggage_tag",
    page_width_mm: w,
    page_height_mm: h,
    sheet_layout: null,
    thermal,
    layers: [
      { id: "band", type: "box", x: 0, y: 0, w, h: 14, fill: "{{DIVISION_COLOR}}" },
      { id: "div", type: "text", text: "{{DIVISION}}", x: 5, y: 2, w: w - 10, h: 10, size: 20, weight: 700, align: "center", color: "#ffffff" },
      { id: "first", type: "text", text: "{{FIRST}}", x: 5, y: 20, w: w - 10, h: 22, size: 40, weight: 700, align: "center", color: "#1d4ed8" },
      { id: "code", type: "qr", text: "{{BARCODE}}", x: 5, y: 50, w: 40, h: 40, color: "#7c3aed" },
    ],
  });
  const items = [{ values: { FIRST: "Levi", DIVISION: "Division 2", DIVISION_COLOR: "#2563eb", BARCODE: "KN0123" }, copies: 2 }];

  it("an upright 4×6 is one 4″ × 6″ page a label, in black and white", () => {
    const html = renderDocument(tag(101.6, 152.4, true), items);
    expect(html).toContain("@page{size:101.6mm 152.4mm;margin:0}");
    expect(html.match(/class="tag"/g)).toHaveLength(2);
    expect(html).not.toMatch(/#2563eb|#1d4ed8|#7c3aed/i);
    expect(html).toContain("filter:grayscale(1)");
    if (process.env.THERMAL_HTML) writeFileSync(process.env.THERMAL_HTML, html);
  });

  it("a 6×4 design on a thermal printer: 4″ × 6″ pages with the design turned", () => {
    const html = renderDocument(tag(152.4, 101.6, true), items);
    expect(html).toContain("@page{size:101.6mm 152.4mm;margin:0}");
    expect(html.match(/class="pg"/g)).toHaveLength(2);
    expect(html).toContain("transform:translateX(101.6mm) rotate(90deg)");
    if (process.env.THERMAL_TURNED_HTML) writeFileSync(process.env.THERMAL_TURNED_HTML, html);
  });

  it("an ordinary template prints as before: colours kept, page as designed", () => {
    const html = renderDocument(tag(152.4, 101.6, false), items);
    expect(html).toContain("@page{size:152.4mm 101.6mm;margin:0}");
    expect(html).toContain("#1d4ed8");
    expect(html).not.toContain('class="pg"');
    expect(html).not.toContain("grayscale");
  });
});

describe("the ready-made 4×6 thermal luggage tag (migration 0042)", () => {
  it("is 4″ × 6″ upright, one a page, every part on the label, with a QR code the scanner reads", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(new URL("../../../supabase/migrations/0042_thermal_templates.sql", import.meta.url), "utf8");
    const layers = JSON.parse(sql.slice(sql.indexOf("'[") + 1, sql.indexOf("]'") + 1)) as Layer[];
    for (const l of layers) {
      expect(l.x + l.w, l.id).toBeLessThanOrEqual(101.6);
      expect(l.y + l.h, l.id).toBeLessThanOrEqual(152.4);
    }
    expect(layers.find((l) => l.type === "qr")).toMatchObject({ text: "{{BARCODE}}" });
    const html = renderDocument(
      { name: "Luggage tag 4×6 (thermal)", kind: "luggage_tag", page_width_mm: 101.6, page_height_mm: 152.4, sheet_layout: null, thermal: true, layers },
      [{ values: { FIRST: "Menachem Mendel", LAST: "Goldberg-Schneerson", DIVISION: "Division 2", BUNK: "Bunk Yud Alef", BARCODE: "KN0123", CODE: "0123" }, copies: 1 }],
    );
    expect(html).toContain("@page{size:101.6mm 152.4mm;margin:0}");
    if (process.env.THERMAL_SEED_HTML) writeFileSync(process.env.THERMAL_SEED_HTML, html);
  });
});
