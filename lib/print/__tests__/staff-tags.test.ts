import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { audienceOf, forCampers, SAMPLE_STAFF, STAFF_FIELDS, staffValues, type StaffPerson } from "../staff-values";
import { renderDocument } from "../render";
import { fill } from "../merge";
import { DIVISION_VALUE, type TemplateSpec } from "../types";

const label = (r: string) => ({ counselor: "Counselor", head_counselor: "Head counselor" })[r] ?? r;
const levi: StaffPerson = {
  name: "Levi Yitzchak Cohen",
  role: "counselor",
  title: "Waterfront",
  phone: "(718) 555-0100",
  email: null,
  sourceId: "3391",
  details: { "Full hebrew name": "לוי יצחק", "T-shirt size": "M", "Date of birth": "1/2/2008" },
  places: [
    { division: "Division 2", color: "#16a34a", camp: "American", bunk: "Bunk Chof" },
    { division: "Division 3", color: null, camp: "American", bunk: null },
  ],
};

describe("staff tags", () => {
  it("reads registration answers by the export's column name too, as camper tags write them", () => {
    const v = staffValues(levi, label);
    expect(fill("{{source.ppa.full_hebrew_name}}", (k) => v[k] ?? "")).toBe("לוי יצחק");
    expect(fill("{{ppa.full_hebrew_name}} · {{ppa.t-shirt_size}}", (k) => v[k] ?? "")).toBe("לוי יצחק · M");
  });

  it("only templates marked for staff are kept out of camper printing", () => {
    expect(forCampers({ audience: "staff" })).toBe(false);
    expect(forCampers({ audience: "campers" })).toBe(true);
    // before migration 0041 there's no audience: every template is for campers
    expect(forCampers({ name: "Name tag" })).toBe(true);
    expect(audienceOf(null)).toBe("campers");
  });

  it("fills a staff member's tag: the last word is the last name, every place they work", () => {
    expect(staffValues(levi, label)).toMatchObject({
      FIRST: "Levi Yitzchak",
      LAST: "Cohen",
      FULL: "Levi Yitzchak Cohen",
      HEBREW_NAME: "לוי יצחק",
      POSITION: "Waterfront",
      ROLE: "Counselor",
      DIVISION: "Division 2, Division 3",
      BUNK: "Bunk Chof",
      CAMP: "American",
      DIVISION_COLOR: "#16a34a",
      PHONE: "(718) 555-0100",
      EMAIL: "",
      TSHIRT: "M",
      STAFF_ID: "3391",
      [DIVISION_VALUE]: "Division 2",
    });
  });

  it("someone with one name, no division and nothing from registration still gets a tag", () => {
    const v = staffValues({ name: "Mendel", role: "head_counselor", title: null, phone: null, email: null, places: [] }, label);
    expect(v).toMatchObject({ FIRST: "Mendel", LAST: "", DIVISION: "", BUNK: "", HEBREW_NAME: "", DIVISION_COLOR: "#64748b", ROLE: "Head counselor" });
  });

  it("every field the editor offers has a value for the sample", () => {
    const v = staffValues(SAMPLE_STAFF, label);
    for (const f of STAFF_FIELDS) expect(v[f.key], f.key).not.toBe("");
    // the registration address: state and country as on every tag
    expect([v.CITY, v.STATE, v.ZIP, v.COUNTRY]).toEqual(["Brooklyn", "NY", "11213", "USA"]);
  });

  it("a camper design copied for staff prints the staff member's name and place", () => {
    const spec: TemplateSpec = {
      name: "Staff name tag",
      kind: "name_tag",
      page_width_mm: 90,
      page_height_mm: 55,
      sheet_layout: { paper: "letter", cols: 2, rows: 5, marginMm: 12, gapMm: 0 },
      layers: [
        { id: "band", type: "box", x: 0, y: 0, w: 4, h: 55, fill: "{{DIVISION_COLOR}}" },
        { id: "first", type: "text", text: "{{FIRST}}", x: 8, y: 6, w: 78, h: 16, size: 26, weight: 700, align: "center", fit: true },
        { id: "last", type: "text", text: "{{LAST}}", x: 8, y: 22, w: 78, h: 8, size: 13, align: "center", fit: true },
        { id: "pos", type: "text", text: "{{POSITION|ROLE}}", x: 8, y: 31, w: 78, h: 6, size: 10, align: "center", fit: true },
        { id: "where", type: "text", text: "{{DIVISION}} · {{BUNK}}", x: 8, y: 38, w: 78, h: 6, size: 9, align: "center", fit: true },
      ],
    };
    const v = staffValues(levi, label);
    expect(fill("{{POSITION|ROLE}}", (k) => v[k] ?? "")).toBe("Waterfront");
    const html = renderDocument(spec, [{ values: v, copies: 1 }, { values: staffValues(SAMPLE_STAFF, label), copies: 1 }]);
    for (const s of ["Levi Yitzchak", "Cohen", "Waterfront", "Division 2, Division 3 · Bunk Chof", "#16a34a", "Menachem Mendel", "Learning head"]) expect(html).toContain(s);
    if (process.env.STAFF_TAG_HTML) writeFileSync(process.env.STAFF_TAG_HTML, html);
  });
});
