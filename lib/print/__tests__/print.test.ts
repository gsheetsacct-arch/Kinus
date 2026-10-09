import { describe, it, expect } from "vitest";
import { applyTransforms, fill, mergeValues } from "../merge";
import { renderDocument } from "../render";
import type { MergeField, ValueMap } from "../types";

const maps = new Map<string, ValueMap>([["m1", { id: "m1", name: "T-shirt", source_field: "tshirt_size", entries: [{ source_value: "youth small", output_value: "YS" }] }]]);
const fields: MergeField[] = [
  { key: "FIRST", label: "", source_field: "first_name", transforms: [] },
  { key: "FULL", label: "", source_field: "{{first_name}} {{last_name}}", transforms: [] },
  { key: "BARCODE", label: "", source_field: "KN{{camper_code}}", transforms: [] },
  { key: "DIV", label: "", source_field: "division", transforms: [{ type: "replace", pattern: "^Division\\s+(\\d+)$", replacement: "$1", flags: "i" }] },
  { key: "TSHIRT", label: "", source_field: "tshirt_size", transforms: [{ type: "value_map", map_id: "m1", fallback: "original" }] },
  { key: "MOM", label: "", source_field: "contact.mother.phone", transforms: [] },
  { key: "COLOR", label: "", source_field: "division_color", transforms: [] },
];
const camper = {
  first_name: "מנחם",
  last_name: "Gérard",
  camper_code: "100016",
  tshirt_size: "Youth  Small",
  division_name: "Division 2",
  division_color: "#0891b2",
  contacts: [{ role: "mother", slot: 1, name: "Ima", phone: "718", phone_e164: "+17185550100", email: null }],
};

describe("merge fields", () => {
  it("fills templates, maps values and applies regex", () => {
    expect(mergeValues(camper, fields, maps)).toEqual({ FIRST: "מנחם", FULL: "מנחם Gérard", BARCODE: "KN100016", DIV: "2", TSHIRT: "YS", MOM: "+17185550100", COLOR: "#0891b2" });
  });
  it("falls back to the original or blank when a value isn't mapped", () => {
    expect(applyTransforms("Adult XXL", [{ type: "value_map", map_id: "m1", fallback: "original" }], maps)).toBe("Adult XXL");
    expect(applyTransforms("Adult XXL", [{ type: "value_map", map_id: "m1", fallback: "blank" }], maps)).toBe("");
    expect(applyTransforms("French Division", [{ type: "replace", pattern: "^Division\\s+(\\d+)$", replacement: "$1" }], maps)).toBe("French Division");
    expect(applyTransforms("léa gérard", [{ type: "case", mode: "title" }], maps)).toBe("Léa Gérard");
    expect(applyTransforms("x", [{ type: "replace", pattern: "(", replacement: "" }], maps)).toBe("x");
  });
  it("leaves unknown placeholders empty", () => {
    expect(fill("{{A}}-{{B}}", (k) => (k === "A" ? "1" : ""))).toBe("1-");
  });
});

describe("renderDocument", () => {
  const spec = {
    name: "Name tag",
    kind: "name_tag",
    page_width_mm: 90,
    page_height_mm: 55,
    sheet_layout: null,
    layers: [
      { id: "a", type: "text" as const, text: "{{FIRST}} <b>", x: 5, y: 5, w: 80, h: 15, size: 24, weight: 700 as const, align: "center" as const, fit: true },
      { id: "b", type: "barcode" as const, text: "{{BARCODE}}", x: 15, y: 35, w: 60, h: 12, showText: true },
      { id: "c", type: "box" as const, x: 0, y: 0, w: 4, h: 55, fill: "{{COLOR}}" },
      { id: "d", type: "box" as const, x: 0, y: 0, w: 4, h: 55, fill: "red;background:url(x)" },
    ],
  };
  const html = renderDocument(spec, [{ values: { FIRST: "מנחם", BARCODE: "KN100016", COLOR: "#0891b2" }, copies: 2 }]);
  it("renders one page per copy at the tag size, with embedded fonts", () => {
    expect(html.match(/class="tag"/g)).toHaveLength(2);
    expect(html).toContain("@page{size:90mm 55mm");
    expect(html).toContain("@font-face");
  });
  it("escapes values, keeps Hebrew direction automatic, and draws the barcode", () => {
    expect(html).toContain('<span dir="auto">מנחם &lt;b&gt;</span>');
    expect(html).toContain("<svg preserveAspectRatio=\"none\"");
    expect(html).toContain('<div class="bc-text">KN100016</div>');
    expect(html).toContain("background:#0891b2");
    expect(html).not.toContain("url(x)");
  });
  it("lays tags out N-up on sheets", () => {
    const sheet = renderDocument({ ...spec, sheet_layout: { paper: "letter", cols: 2, rows: 5, marginMm: 10, gapMm: 3 } }, Array.from({ length: 12 }, () => ({ values: {}, copies: 1 })));
    expect(sheet.match(/class="sheet"/g)).toHaveLength(2);
    expect(sheet).toContain("@page{size:215.9mm 279.4mm");
  });
});
