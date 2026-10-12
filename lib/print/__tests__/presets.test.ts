import { describe, expect, it } from "vitest";
import { findPresets, LABEL_PRESETS, presetById } from "../presets";

const PAPER = { letter: [215.9, 279.4], a4: [210, 297] } as const;

describe("label presets", () => {
  it("have unique ids and product numbers", () => {
    expect(new Set(LABEL_PRESETS.map((p) => p.id)).size).toBe(LABEL_PRESETS.length);
    const numbers = LABEL_PRESETS.flatMap((p) => [p.product, ...p.alsoFits].map((n) => `${p.brand} ${n}`));
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it.each(LABEL_PRESETS.filter((p) => p.sheet).map((p) => [p.product, p] as const))("%s fits its sheet, with even side margins and no overlaps", (_, p) => {
    const s = p.sheet!;
    const [pw, ph] = PAPER[s.paper];
    const right = pw - (s.leftMm + s.pitchXMm * (s.cols - 1) + p.widthMm);
    const bottom = ph - (s.topMm + s.pitchYMm * (s.rows - 1) + p.heightMm);
    expect(right).toBeGreaterThanOrEqual(-0.05);
    expect(bottom).toBeGreaterThanOrEqual(-0.05);
    expect(Math.abs(right - s.leftMm)).toBeLessThan(0.3);
    expect(Math.abs(bottom - s.topMm)).toBeLessThan(0.3);
    if (s.cols > 1) expect(s.pitchXMm).toBeGreaterThanOrEqual(p.widthMm - 0.05);
    if (s.rows > 1) expect(s.pitchYMm).toBeGreaterThanOrEqual(p.heightMm - 0.05);
  });

  it("matches Avery's published 5160 layout", () => {
    const p = presetById("avery-5160")!;
    expect([p.widthMm, p.heightMm]).toEqual([66.68, 25.4]);
    expect(p.sheet).toMatchObject({ cols: 3, rows: 10, leftMm: 4.76, topMm: 12.7, pitchXMm: 69.85, pitchYMm: 25.4 });
  });

  it("finds a sheet by any number on the box", () => {
    expect(findPresets("8160")[0].product).toBe("5160");
    expect(findPresets("8395")[0].product).toBe("5395");
    expect(findPresets("name badge").length).toBeGreaterThan(3);
  });
});

import { contentHash, templateKeys } from "../content";

describe("label fingerprints", () => {
  const spec = {
    layers: [
      { id: "a", type: "text" as const, text: "{{FIRST}} {{ LAST }}", x: 0, y: 0, w: 10, h: 10, size: 10 },
      { id: "b", type: "text" as const, text: "{{BUNK_HE|BUNK}}", x: 0, y: 0, w: 10, h: 10, size: 10 },
      { id: "c", type: "box" as const, fill: "{{DIVISION_COLOR}}", x: 0, y: 0, w: 1, h: 1 },
    ],
  };
  it("lists the fields a template prints", () => {
    expect(templateKeys(spec)).toEqual(["BUNK", "BUNK_HE", "DIVISION_COLOR", "FIRST", "LAST"]);
  });
  it("changes only when a printed value changes", () => {
    const keys = templateKeys(spec);
    const a = contentHash(keys, { FIRST: "Moshe", LAST: "Cohen", BUNK: "Yud", TSHIRT: "M" });
    expect(contentHash(keys, { FIRST: "Moshe", LAST: "Cohen", BUNK: "Yud", TSHIRT: "L" })).toBe(a);
    expect(contentHash(keys, { FIRST: "Moshe", LAST: "Cohen", BUNK: "Yud Alef" })).not.toBe(a);
  });
});
