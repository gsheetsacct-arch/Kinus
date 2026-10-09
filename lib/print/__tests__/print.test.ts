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

describe("export columns, alternatives and turned parts", () => {
  const camper = {
    first_name: "Levi",
    last_name: "Cohen",
    bunk_name: "Bunk Chof",
    source_data: { "ppa.hebrew_name": "לוי יצחק", "ppa.city": "Melbourne", "ppa.state": "", "ppa.country": "Australia", "group_types.hebrew_bunks": "" },
  };
  it("reads any export column, Publisher-style (#) or not", async () => {
    const { sourceValues, fill } = await import("../merge");
    const get = sourceValues(camper);
    expect(get("source.ppa.hebrew_name")).toBe("לוי יצחק");
    expect(get("source.PPA#Hebrew_Name")).toBe("לוי יצחק");
    expect(get("source.ppa.missing")).toBe("");
    expect(fill("{{source.group_types.hebrew_bunks|bunk}}", get)).toBe("Bunk Chof");
  });
  it("tidies an address with a missing part", async () => {
    const { mergeValues } = await import("../merge");
    const from = { key: "FROM", label: "From", source_field: "{{source.ppa.city}}, {{source.ppa.state}} {{source.ppa.country}}", transforms: FROM_TIDY };
    expect(mergeValues(camper as never, [from], new Map()).FROM).toBe("Melbourne, Australia");
    const full = { ...camper, source_data: { "ppa.city": "Toronto", "ppa.state": "ON", "ppa.country": "Canada" } };
    expect(mergeValues(full as never, [from], new Map()).FROM).toBe("Toronto, ON Canada");
    const none = { ...camper, source_data: {} };
    expect(mergeValues(none as never, [from], new Map()).FROM).toBe("");
  });
  it("turns a barcode a quarter turn inside its box", async () => {
    const { renderDocument } = await import("../render");
    const html = renderDocument({ name: "t", kind: "other", page_width_mm: 152.4, page_height_mm: 101.6, sheet_layout: null, layers: [{ id: "b", type: "barcode", text: "KN{{CODE}}", x: 2, y: 5, w: 12, h: 90, rotate: -90 }] }, [{ values: { CODE: "100016" }, copies: 1 }]);
    expect(html).toContain("left:2mm;top:5mm;width:12mm;height:90mm;overflow:visible");
    expect(html).toContain("width:90mm;height:12mm;transform:translate(-50%,-50%) rotate(-90deg)");
    expect(html).toContain("KN100016");
  });
});

// the same steps migration 0010 gives {{FROM}}
const FROM_TIDY = [
  { type: "replace" as const, pattern: "\\s*,\\s*(?=,|$)", replacement: "", flags: "g" },
  { type: "replace" as const, pattern: "^\\s*,\\s*", replacement: "", flags: "" },
  { type: "replace" as const, pattern: ",\\s+", replacement: ", ", flags: "g" },
  { type: "replace" as const, pattern: "\\s{2,}", replacement: " ", flags: "g" },
];
