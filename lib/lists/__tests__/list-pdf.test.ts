import { describe, expect, it } from "vitest";
import { listHtml } from "../list-pdf";
import type { BuiltList } from "@/lib/data/lists";

const list = {
  preset: { name: "Bunk list", group_by: "bunk" },
  scopeLabel: "Division 1",
  columns: [{ key: "display_name", label: "Name" }, { key: "x", label: "Allergies" }],
  groups: [
    { title: "Bunk א", rows: [{ id: "1", cells: ["Levi <Cohen>", true] }], staff: ["Moshe"] },
    { title: "Bunk ב", rows: [{ id: "2", cells: ["Dovid", null] }] },
  ],
} as unknown as BuiltList;

describe("list PDF", () => {
  it("has the cover, each group (with copies) and a margin", () => {
    const html = listHtml(list, { session: "Kinus 5787", camp: "American", by: "Office", copies: 2 });
    expect(html).toContain("margin:15mm");
    expect(html).toContain("Levi &lt;Cohen&gt;");
    expect(html).toContain(">Yes<");
    expect(html.match(/class="group"/g)).toHaveLength(4);
    expect(html).toContain("2 copies of each");
    expect(html).toContain("data-fitted");
  });
  it("follows the layout's orientation", () => {
    const o = { session: null, camp: null, by: "Office", copies: 1 };
    expect(listHtml(list, o)).toContain("size:letter portrait");
    expect(listHtml({ ...list, preset: { ...list.preset, orientation: "landscape" } } as BuiltList, o)).toContain("size:letter landscape");
  });
});
