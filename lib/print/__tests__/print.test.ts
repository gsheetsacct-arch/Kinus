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
    expect(mergeValues(camper, fields, maps)).toEqual({ FIRST: "מנחם", FULL: "מנחם Gérard", BARCODE: "KN100016", DIV: "2", TSHIRT: "YS", MOM: "+17185550100", COLOR: "#0891b2", __division: "Division 2" });
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

describe("part-used label sheets", async () => {
  const { sheetStock, nextPosition, sheetsUsed, clampPosition, usedAfter, usedBefore, cleanUsed } = await import("../sheet-position");
  const { renderDocument } = await import("../render");
  const spec = { name: "Avery 5160", kind: "name_tag", page_width_mm: 66.7, page_height_mm: 25.4, layers: [{ id: "a", type: "text" as const, text: "{{NAME}}", x: 1, y: 1, w: 60, h: 10, size: 12 }], sheet_layout: { paper: "letter" as const, cols: 3, rows: 10, leftMm: 4.8, topMm: 12.7, pitchXMm: 69.85, pitchYMm: 25.4, preset: "avery-5160" } };

  it("knows the stock, and label printers have none", () => {
    expect(sheetStock(spec)).toMatchObject({ key: "avery-5160", perSheet: 30, cols: 3, rows: 10 });
    expect(sheetStock({ ...spec, sheet_layout: null })).toBeNull();
    expect(sheetStock({ ...spec, sheet_layout: { ...spec.sheet_layout, preset: undefined } })?.key).toBe("letter-3x10-667x254");
  });

  it("continues where the last print stopped", () => {
    expect(nextPosition(1, 7, 30)).toBe(8);
    expect(nextPosition(8, 23, 30)).toBe(1); // the sheet ended full: a fresh one next
    expect(nextPosition(28, 5, 30)).toBe(3); // 3 on the old sheet, 2 on a new one
    expect(sheetsUsed(usedBefore(28, 30), 5, 30)).toBe(2);
    expect(sheetsUsed([], 30, 30)).toBe(1);
    expect(clampPosition(0, 30)).toBe(1);
    expect(clampPosition(31, 30)).toBe(1);
  });

  it("works with any labels already gone, not just the first ones", () => {
    // labels 2, 5 and 6 peeled off a sheet of 8
    expect(usedAfter([2, 5, 6], 2, 8)).toEqual([1, 2, 3, 5, 6]);
    expect(usedAfter([2, 5, 6], 5, 8)).toEqual([]); // exactly fills the sheet: fresh next
    expect(usedAfter([2, 5, 6], 7, 8)).toEqual([1, 2]); // 5 there, 2 on a new sheet
    expect(sheetsUsed([2, 5, 6], 7, 8)).toBe(2);
    expect(cleanUsed([3, 3, 99, 0, 1], 8)).toEqual([1, 3]);
    expect(cleanUsed([1, 2, 3, 4, 5, 6, 7, 8], 8)).toEqual([]); // a used-up sheet is a fresh one
  });

  it("leaves the used labels empty and fills from the start position", () => {
    const html = renderDocument(spec, [{ values: { NAME: "Chaya" }, copies: 1 }, { values: { NAME: "Mendy" }, copies: 1 }], { skip: 7 });
    const tags = [...html.matchAll(/<div class="tag" style="left:([\d.]+)mm;top:([\d.]+)mm;/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(tags).toHaveLength(2);
    // the used ones are only marked on screen
    expect(html.match(/class="tag used"/g)).toHaveLength(7);
    expect(html).toContain("@media print{body{display:block}.used{display:none}}");
    // label 8 = row 3, column 2
    expect(tags[0]).toEqual([74.65, 63.5]);
    expect(html.match(/class="sheet"/g)).toHaveLength(1);
    // skipping a whole sheet or more is never allowed
    expect(renderDocument(spec, [{ values: { NAME: "A" }, copies: 1 }], { skip: 99 }).match(/class="sheet"/g)).toHaveLength(1);
  });
});

describe("background images", async () => {
  const { renderDocument } = await import("../render");
  it("are in the page once, however many tags", () => {
    const bg = "data:image/png;base64," + "A".repeat(5000);
    const spec = { name: "Tag", kind: "name_tag", page_width_mm: 80, page_height_mm: 50, layers: [], sheet_layout: null };
    const html = renderDocument(spec, [{ values: {}, copies: 25 }], { background: bg });
    expect(html.split(bg).length - 1).toBe(1);
    expect(html.match(/class="bg"/g)).toHaveLength(25);
  });
});

describe("labels gone here and there", async () => {
  const { renderDocument } = await import("../render");
  it("prints in the free labels only", () => {
    const spec = { name: "Tag", kind: "name_tag", page_width_mm: 80, page_height_mm: 50, layers: [], sheet_layout: { paper: "letter" as const, cols: 2, rows: 4, leftMm: 10, topMm: 10, pitchXMm: 100, pitchYMm: 60 } };
    const html = renderDocument(spec, [{ values: {}, copies: 3 }], { usedSlots: [1, 3, 4] });
    const at = [...html.matchAll(/<div class="tag" style="left:([\d.]+)mm;top:([\d.]+)mm;/g)].map((m) => `${m[1]},${m[2]}`);
    // free: 2 (right of row 1), 5, 6 (row 3)
    expect(at).toEqual(["110.00,10.00", "10.00,130.00", "110.00,130.00"]);
    expect(html.match(/class="tag used"/g)).toHaveLength(3);
  });
});

describe("printing order", async () => {
  const { byBunkThenName } = await import("../data");
  it("goes by division, bunk (Alef-Beis) and name, with no bunk last", () => {
    const c = (division_name: string | null, bunk_name: string | null, first_name: string) => ({ division_name, bunk_name, first_name, last_name: "X" }) as never;
    const list = [c("Division 2", "Bunk Yud", "A"), c("Division 1", null, "B"), c("Division 1", "Bunk Beis", "C"), c("BMD", "Bunk Alef", "D"), c("Division 1", "Bunk Alef", "E"), c(null, null, "F"), c("Division 1", "Bunk Yud Alef", "G"), c("Division 1", "Bunk Yud", "H")];
    expect(list.sort(byBunkThenName).map((x: { first_name: string }) => x.first_name).join("")).toBe("ECHGBADF");
  });
});

describe("hidden parts and line height", async () => {
  const { templateKeys } = await import("../content");
  const tpl = {
    name: "Tag",
    kind: "name_tag",
    page_width_mm: 80,
    page_height_mm: 50,
    sheet_layout: null,
    layers: [
      { id: "a", type: "text" as const, text: "{{FIRST}}", x: 0, y: 0, w: 80, h: 20, size: 20, font: "display" as const },
      { id: "b", type: "text" as const, text: "{{TSHIRT}}", x: 0, y: 25, w: 80, h: 10, size: 10, hidden: true },
    ],
  };
  it("leaves hidden parts off the page and out of what counts as changed", () => {
    const html = renderDocument(tpl, [{ values: { FIRST: "Yossi", TSHIRT: "YS" }, copies: 1 }]);
    expect(html).toContain("Yossi");
    expect(html).not.toContain(">YS<");
    expect(templateKeys(tpl)).toEqual(["FIRST"]);
  });
  it("sets each font's line height, and never lets the smallest size be above the size", async () => {
    const { minPt } = await import("../render-constants");
    const html = renderDocument(tpl, [{ values: { FIRST: "Yossi" }, copies: 1 }]);
    expect(html).toContain("line-height:1.5");
    // a longer name than the template was made for goes under the smallest size (to 4 pt) rather than be cut
    expect(html).toContain(`data-min="${(6 * 96 / 72).toFixed(2)}" data-floor="${(4 * 96 / 72).toFixed(2)}"`);
    expect(minPt({ size: 5 })).toBe(5);
    expect(minPt({ size: 20 })).toBe(6);
    expect(minPt({ size: 20, minSize: 9 })).toBe(9);
  });
});
