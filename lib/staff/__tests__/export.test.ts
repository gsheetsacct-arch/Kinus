import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { addressLine, isStaffExport, readStaffExport } from "../export";
import { planRows } from "../bulk";
import type { AreaTree } from "@/lib/data/areas";

// the registration staff export's header row, as it downloads (the file starts with a byte-order mark)
const HEADER = "students.id,ppa.first_name,ppa.last_name,ppa.full_hebrew_name,ppa.mother's_full_hebrew_name,ppa.date_of_birth,students.role,ppa.cell_phone,ppa.phone_number_we_can_reach_you,ppa.phone_number,ppa.whos_number,ppa.smart_phone,ppa.email_address,ppa.home_address,ppa.city,ppa.state,ppa.zip_code,ppa.country,ppa.fathers_name,ppa.mothers_name,ppa.yeshivah,ppa.shiur,ppa.maggid_shiur,ppa.t-shirt_size,ppa.position,ppa.other_position_kinus,ppa.division_preference,ppa.co-counselor,ppa.kinus_experience,ppa.kinus_experience_years,ppa.camp_experience,ppa.which_camps,ppa.camp_years,ppa.camp_positions,ppa.camp_employer,ppa.positions-experience,ppa.child_care_experience,ppa.other_experience,ppa.first_aid,ppa.talent,ppa.photographer,ppa.camera,ppa.which_one,ppa.reference_1,ppa.reference_1_number,ppa.reference_2,ppa.reference_2_number,ppa.notes_/_comments,ppa.counselors_confirmation,ppa.kloli_confirmation,ppa.agreement_1,ppa.agreement_2,ppa.agreement_3,ppa.agreement_4,ppa.agreement_5,ppa.agreement_6,ppa.agreement_7,ppa.agreement_8,group_types.staff,group_types.division,group_types.bunks,applications.last_step_number,applications.last_step_name,applications.status,ppa.emergency_contact_1,ppa.phone_number_for_emergency_contact_1,ppa.emergency_contact_2,ppa.emergency_contact_number,ppa.crown_heights_address,ppa.allergies_yes_or_no,ppa.allergies,ppa.medications_yes_no,ppa.medical_considerations,applications.started_at,applications.last_update,programs.name";
const cols = HEADER.split(",");
const row = (v: Record<string, string>) => cols.map((c) => v[c] ?? "");
const grid = (rows: Record<string, string>[]) => [["\uFEFF" + cols[0], ...cols.slice(1)], ...rows.map(row), cols.map(() => ""), cols.map(() => "")];

const levi = {
  "students.id": "3391",
  "ppa.first_name": "Levi",
  "ppa.last_name": "Cohen",
  "ppa.date_of_birth": "1/2/2008",
  "ppa.cell_phone": "Yes",
  "ppa.phone_number_we_can_reach_you": "(718) 555-0100",
  "ppa.email_address": "Levi@Example.org",
  "ppa.home_address": "4 Main Street #6B",
  "ppa.city": "Brooklyn",
  "ppa.state": "NY",
  "ppa.zip_code": "11213",
  "ppa.country": "United States",
  "ppa.position": "Counselor",
  "ppa.t-shirt_size": "M",
  "ppa.agreement_1": "I Agree",
  "group_types.division": "Division 2",
  "group_types.bunks": "Bunk Chof",
  "applications.status": "Accepted",
  "applications.last_step_name": "Thank you",
  "programs.name": "Kinus 5787",
};
const tree: AreaTree = {
  groups: [],
  divisions: [{ id: "d2", name: "Division 2", group_id: null, color: null, bunks: [{ id: "b3", name: "Bunk Chof" }] }],
};

describe("the registration staff export", () => {
  it("is recognised by its columns", () => {
    expect(isStaffExport(grid([levi]))).toBe(true);
    expect(isStaffExport([["Name", "Email"], ["Levi", "l@x.com"]])).toBe(false);
  });

  it("brings in accepted staff only, and says who was left out", () => {
    const r = readStaffExport(grid([levi, { ...levi, "students.id": "2", "applications.status": "Under Review" }, { ...levi, "students.id": "3", "applications.status": "under review" }, { ...levi, "students.id": "4", "applications.status": "Declined" }]));
    expect(r.rows.map((x) => x.sourceId)).toEqual(["3391"]);
    expect(r.skipped).toEqual([
      { status: "Under Review", count: 1 },
      { status: "under review", count: 1 },
      { status: "Declined", count: 1 },
    ]);
  });

  it("brings in confirmed staff only, not those still pending confirmation", () => {
    const statuses = ["Accepted - Confirmed", "Counselor Accepted -Pending Confirmation", "Kloli Accepted - Pending Confirmation", "Waiting List", "In Progress", "Rejected", "Kloli Accepted - Confirmed"];
    const r = readStaffExport(grid(statuses.map((st, i) => ({ ...levi, "students.id": String(i), "applications.status": st }))));
    expect(r.rows.map((x) => x.sourceId)).toEqual(["0", "6"]);
    expect(r.skipped.map((x) => x.status)).toHaveLength(5);
  });

  it("takes each person's role from the export: staff group, then the status, then their position", () => {
    const r = readStaffExport(
      grid([
        { ...levi, "students.id": "1", "applications.status": "Kloli Accepted - Confirmed" },
        { ...levi, "students.id": "2", "group_types.staff": "Klolim" },
        { ...levi, "students.id": "3", "ppa.email_address": "hc@example.org", "ppa.position": "Head Counselor", "applications.status": "Accepted - Confirmed" },
      ]),
    ).rows;
    expect(r.map((x) => x.role)).toEqual(["kloli", "Klolim", ""]);
    const planned = planRows(r, tree, { role: "counselor", level: "role" });
    expect(planned.map((x) => x.role)).toEqual(["kloli", "kloli", "head_counselor"]);
  });

  it("reads name, id, phone (not the yes/no question), division, bunk and address", () => {
    const [p] = readStaffExport(grid([levi])).rows;
    expect(p).toMatchObject({ line: 2, sourceId: "3391", name: "Levi Cohen", email: "levi@example.org", phone: "(718) 555-0100", where: "Division 2", bunk: "Bunk Chof", title: "Counselor", signs: "no" });
    expect(p.address).toEqual({ street: "4 Main Street #6B", city: "Brooklyn", state: "NY", zip: "11213", country: "United States" });
    expect(addressLine(p.address)).toBe("4 Main Street #6B, Brooklyn, NY 11213");
  });

  it("keeps the other answers that have something in them, and nothing from columns empty on every row", () => {
    const [p] = readStaffExport(grid([levi, { ...levi, "students.id": "5", "ppa.t-shirt_size": "" }])).rows;
    expect(p.details).toEqual({ "Date of birth": "1/2/2008", "T-shirt size": "M", "Agreement 1": "I Agree" });
    const empty = readStaffExport(grid([{ ...levi, "ppa.t-shirt_size": "" }])).rows[0];
    expect(empty.details).not.toHaveProperty("T-shirt size");
  });

  it("an accepted person not yet placed comes in with a warning; a misspelt division is caught", () => {
    const rows = readStaffExport(grid([{ ...levi, "group_types.division": "", "group_types.bunks": "" }, { ...levi, "students.id": "6", "ppa.email_address": "other@example.org", "group_types.division": "Divison 2" }])).rows;
    const [unplaced, typo] = planRows(rows, tree, { role: "counselor", level: "role" });
    expect(unplaced.errors).toEqual([]);
    expect(unplaced.warnings[0]).toMatch(/No division yet/);
    expect(unplaced.role).toBe("counselor");
    expect(unplaced.login).toBe("none");
    expect(typo.errors[0]).toMatch(/Did you mean “Division 2”/);
    const placed = planRows(readStaffExport(grid([levi])).rows, tree, { role: "counselor", level: "role" })[0];
    expect(placed).toMatchObject({ errors: [], warnings: [], areaText: "Division 2 · Bunk Chof" });
  });

  it("reads the file as it downloads (CSV, with the trailing empty rows)", () => {
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(grid([levi])));
    const wb = XLSX.read(csv, { type: "string", raw: true });
    const back = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
    expect(readStaffExport(back).rows).toHaveLength(1);
  });
});
