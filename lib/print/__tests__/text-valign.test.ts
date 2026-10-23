import { describe, expect, it } from "vitest";
import { renderDocument } from "../render";
import { textAlignItems } from "../types";

const name = { id: "n", type: "text" as const, text: "{{FIRST}} {{LAST}}", x: 6, y: 72, w: 86, h: 15, size: 24 };

describe("where text sits in its box", () => {
  it("middle by default, top when it wraps, as chosen otherwise", () => {
    expect(textAlignItems({})).toBe("center");
    expect(textAlignItems({ wrap: true })).toBe("flex-start");
    expect(textAlignItems({ wrap: true, valign: "bottom" })).toBe("safe flex-end");
    expect(textAlignItems({ valign: "top" })).toBe("flex-start");
    expect(textAlignItems({ wrap: true, valign: "middle" })).toBe("center");
  });
  it("prints a long name on two balanced lines, from the bottom of its box", () => {
    const html = renderDocument(
      { name: "t", kind: "name_tag", page_width_mm: 98, page_height_mm: 127, sheet_layout: null, layers: [{ ...name, wrap: true, valign: "bottom" }] },
      [{ values: { FIRST: "Chaim Shimshon Halevi", LAST: "Hershcovich" }, copies: 1 }],
    );
    expect(html).toContain('class="l t wrap"');
    expect(html).toContain("align-items:safe flex-end");
    expect(html).toContain(".t.wrap span{text-wrap:balance}");
  });
});

describe("line spacing", () => {
  it("prints the part's own spacing, else the font's", () => {
    const t = (extra: object) =>
      renderDocument({ name: "t", kind: "name_tag", page_width_mm: 98, page_height_mm: 127, sheet_layout: null, layers: [{ ...name, wrap: true, ...extra }] }, [{ values: { FIRST: "A", LAST: "B" }, copies: 1 }]);
    expect(t({ lineHeight: 1.25 })).toContain("line-height:1.25;");
    expect(t({})).not.toContain("line-height:1.25;");
  });
  it("wrapped text steps down instead of jumping past one-line sizes", () => {
    const html = renderDocument({ name: "t", kind: "name_tag", page_width_mm: 98, page_height_mm: 127, sheet_layout: null, layers: [name] }, [{ values: {}, copies: 1 }]);
    expect(html).toContain('if(getComputedStyle(el).whiteSpace!=="nowrap")r=1;');
  });
});
