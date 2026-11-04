import { describe, expect, it } from "vitest";
import { contentHash, labelValues, templateKeys } from "../content";
import { DIVISION_VALUE, type TemplateSpec } from "../types";

describe("staff tags in the queue", () => {
  it("a tag changes when what it shows changes, the division (its design) included", () => {
    const spec = { layers: [{ id: "a", type: "image", path: "p.png", x: 0, y: 0, w: 1, h: 1, byDivision: { "Division 2": "d2.png", "Bar Mitzvah Program": "bmp.png" } }, { id: "n", type: "text", text: "{{FIRST}} {{ROLE_HE|ROLE}}", x: 0, y: 0, w: 1, h: 1, size: 10 }] } as unknown as TemplateSpec;
    const said = (v: Record<string, string>) => contentHash(templateKeys(spec), labelValues(spec, v));
    const was = { FIRST: "Leibel", ROLE: "Head counselor", [DIVISION_VALUE]: "All Access", PHONE: "1" };
    expect(said({ ...was, PHONE: "2" })).toBe(said(was)); // not on the tag
    expect(said({ ...was, [DIVISION_VALUE]: "Bar Mitzvah Program" })).not.toBe(said(was));
    expect(said({ ...was, ROLE: "Director" })).not.toBe(said(was));
  });
});
