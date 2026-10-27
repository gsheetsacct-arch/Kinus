import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { contentHash, labelValues, PICTURES_VALUE, sameContent, templateKeys } from "../content";
import { DIVISION_VALUE, type Layer, type TemplateSpec } from "../types";

/**
 * "New + changed" prints a camper's label again only when something printed on it is
 * different now: any field inside any text, barcode, QR or color, whichever alternative shows,
 * the division's picture. Fields that aren't on the label never count.
 */
const text = (id: string, t: string, more: Partial<Layer> = {}) => ({ id, type: "text", text: t, x: 0, y: 0, w: 10, h: 10, size: 10, ...more }) as Layer;
const spec = (layers: Layer[], back: TemplateSpec["back"] = null) => ({ layers, back });
// printed with these values, then: is it still the same with those?
const still = (s: ReturnType<typeof spec>, then: Record<string, string>, now: Record<string, string>) => {
  const keys = templateKeys(s);
  return sameContent(contentHash(keys, labelValues(s, then)), keys, labelValues(s, now));
};
const camper = { FIRST: "Levi", LAST: "Cohen", BUNK: "Yud", BUNK_HE: "", DIV: "1", TSHIRT: "M", PHONE: "555-1234", CODE: "0012", BUZZER: "007", [DIVISION_VALUE]: "Division 1" };

describe("which labels count as changed", () => {
  it("a field inside a line of text", () => {
    const s = spec([text("a", "Hi {{FIRST}}! Bunk {{BUNK}} · {{DIV}}")]);
    expect(still(s, camper, camper)).toBe(true);
    expect(still(s, camper, { ...camper, FIRST: "Levik" })).toBe(false);
    expect(still(s, camper, { ...camper, BUNK: "Yud Alef" })).toBe(false);
    expect(still(s, camper, { ...camper, DIV: "2" })).toBe(false);
  });
  it("never a field that isn't on the label", () => {
    const s = spec([text("a", "{{FIRST}} {{LAST}}")]);
    expect(still(s, camper, { ...camper, TSHIRT: "L", PHONE: "555-9999", BUNK: "Zayin", BUZZER: "012" })).toBe(true);
  });
  it("barcodes, QR codes and colors", () => {
    const s = spec([
      { id: "b", type: "barcode", text: "KN{{CODE}}", x: 0, y: 0, w: 10, h: 5 },
      { id: "q", type: "qr", text: "{{CODE}}", x: 0, y: 0, w: 5, h: 5 },
      { id: "c", type: "box", fill: "{{DIV_COLOR}}", x: 0, y: 0, w: 5, h: 5 },
    ]);
    expect(still(s, camper, { ...camper, CODE: "0013" })).toBe(false);
    expect(still(s, { ...camper, DIV_COLOR: "#f00" }, { ...camper, DIV_COLOR: "#00f" })).toBe(false);
    expect(still(s, { ...camper, DIV_COLOR: "#f00" }, { ...camper, DIV_COLOR: "#f00", FIRST: "Moshe" })).toBe(true);
  });
  it("of alternatives, only the one that shows", () => {
    const s = spec([text("a", "{{BUNK_HE|BUNK}}")]);
    const he = { ...camper, BUNK_HE: "יוד" };
    // the Hebrew shows: the English bunk name isn't on the label
    expect(still(s, he, { ...he, BUNK: "Yud Alef" })).toBe(true);
    expect(still(s, he, { ...he, BUNK_HE: "יוד א" })).toBe(false);
    // no Hebrew: the English shows
    expect(still(s, camper, { ...camper, BUNK: "Yud Alef" })).toBe(false);
    // the Hebrew added: the label now says something else
    expect(still(s, camper, he)).toBe(false);
  });
  it("the buzzer number", () => {
    const s = spec([text("a", "{{BUZZER}}"), text("b", "{{FIRST}}")]);
    expect(still(s, camper, { ...camper, BUZZER: "008" })).toBe(false);
  });
  it("not spaces that don't show", () => {
    const s = spec([text("a", "{{FIRST}} {{LAST}}")]);
    expect(still(s, camper, { ...camper, FIRST: " Levi ", LAST: "Cohen  " })).toBe(true);
  });
  it("hidden parts, and the back of a one-sided tag, don't print, so don't count", () => {
    const parts = [text("a", "{{FIRST}}"), text("h", "{{TSHIRT}}", { hidden: true }), text("k", "{{PHONE}}", { side: "back" })];
    expect(still(spec(parts), camper, { ...camper, TSHIRT: "L", PHONE: "555-0000" })).toBe(true);
    // two-sided: the back prints
    expect(still(spec(parts, { flip: "long" }), camper, { ...camper, PHONE: "555-0000" })).toBe(false);
  });
  it("a division's own picture, but not a move between divisions with the same one", () => {
    const s = spec([{ id: "p", type: "image", path: "logo.png", x: 0, y: 0, w: 5, h: 5, byDivision: { "Division 3": "d3.png" } }, text("a", "{{FIRST}}")]);
    expect(templateKeys(s)).toContain(PICTURES_VALUE);
    expect(still(s, camper, { ...camper, [DIVISION_VALUE]: "Division 2" })).toBe(true);
    expect(still(s, camper, { ...camper, [DIVISION_VALUE]: "Division 3" })).toBe(false);
  });
  it("labels printed before alternatives and pictures were fingerprinted this way still compare", () => {
    const sha = (v: string) => createHash("sha1").update(v).digest("hex").slice(0, 10);
    const s = spec([text("a", "{{BUNK_HE|BUNK}}"), { id: "p", type: "image", path: "logo.png", x: 0, y: 0, w: 5, h: 5, byDivision: { "Division 3": "d3.png" } }]);
    // the older fingerprint: each alternative, and the division's name
    const old = `v2;BUNK=${sha("Yud")};BUNK_HE=${sha("")};${DIVISION_VALUE}=${sha("Division 1")}`;
    const keys = templateKeys(s);
    expect(sameContent(old, keys, labelValues(s, camper))).toBe(true);
    expect(sameContent(old, keys, labelValues(s, { ...camper, BUNK: "Zayin" }))).toBe(false);
    expect(sameContent(old, keys, labelValues(s, { ...camper, [DIVISION_VALUE]: "Division 2" }))).toBe(false);
  });
});
