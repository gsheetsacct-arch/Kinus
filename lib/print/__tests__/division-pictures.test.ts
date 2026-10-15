import { describe, expect, it } from "vitest";
import { renderDocument } from "../render";
import { DIVISION_VALUE, pictureFor, picturesOf, type TemplateSpec } from "../types";
import { imageClass } from "../render";

const part = { id: "p", type: "image" as const, path: "pictures/main.png", x: 0, y: 0, w: 10, h: 10, byDivision: { "Division 2": "pictures/d2.png", "French Division": "" } };

describe("per-division pictures", () => {
  it("picks the division's own picture, else the main one, matched by name", () => {
    expect(pictureFor(part, "Division 2")).toBe("pictures/d2.png");
    expect(pictureFor(part, " division 2 ")).toBe("pictures/d2.png");
    expect(pictureFor(part, "Division 1")).toBe("pictures/main.png");
    expect(pictureFor(part, null)).toBe("pictures/main.png");
    expect(pictureFor(part, "French Division")).toBe("");
  });
  it("lists every picture a part can show", () => {
    expect(picturesOf(part)).toEqual(["pictures/main.png", "pictures/d2.png"]);
  });
  it("prints each camper's division picture, and none where set to none", () => {
    const spec: TemplateSpec = { name: "t", kind: "name_tag", page_width_mm: 50, page_height_mm: 30, layers: [part], sheet_layout: null };
    const html = renderDocument(spec, [
      { values: { [DIVISION_VALUE]: "Division 2" }, copies: 1 },
      { values: { [DIVISION_VALUE]: "Division 1" }, copies: 1 },
      { values: { [DIVISION_VALUE]: "French Division" }, copies: 1 },
    ]);
    const body = html.split("<body>")[1];
    expect(body.match(new RegExp(imageClass("pictures/d2.png"), "g"))?.length).toBe(1);
    expect(body.match(new RegExp(imageClass("pictures/main.png"), "g"))?.length).toBe(1);
    expect(body.match(/class="l im /g)?.length).toBe(2);
  });
});
