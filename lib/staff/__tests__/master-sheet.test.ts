import { describe, expect, it } from "vitest";
import { divisionFor, findStaffTable, readMasterSheet } from "../master-sheet";
import { planRows } from "../bulk";
import type { AreaTree } from "@/lib/data/areas";

const HEAD = ["Staff ID", "Source", "First Name", "Last Name", "Hebrew Name", "Phone", "Email", "City", "STATUS", "Flag", "Office Notes", "Position (badge)", "Division", "Bunk #", "Bunk (Hebrew)", "Boldrr ID", "Boldrr Status", "Shirt Size"];
const person = (v: Record<string, string>) => HEAD.map((h) => v[h] ?? "");
const base = { "Staff ID": "KTH-1", Source: "Boldrr", "First Name": "Levi", "Last Name": "Cohen", "Hebrew Name": "לוי", Phone: "7185550100", Email: "levi@example.org", City: "Brooklyn", STATUS: "Confirmed", "Position (badge)": "Counselor", Division: "Division 2", "Bunk #": "26", "Bunk (Hebrew)": "Bunk כו", "Boldrr ID": "3391", "Boldrr Status": "Accepted - Confirmed" };
// a workbook: an instructions tab first, then the MASTER tab with a title row above the headers
const workbook = (rows: Record<string, string>[]) => [
  { name: "Start here", grid: [["How to use this sheet"], ["One row per person"]] },
  { name: "MASTER", grid: [["MASTER: one row per person"], [], HEAD, ...rows.map(person)] },
];
const divisions = ["Division 1", "Division 2", "Bar Mitzvah Program"];
const tree: AreaTree = {
  groups: [],
  divisions: divisions.map((name, i) => ({ id: `d${i}`, name, group_id: null, color: null, bunks: [{ id: `d${i}-26`, name: "Bunk 26" }] })),
};

describe("the office's staff workbook (MASTER tab)", () => {
  it("finds the MASTER table in a workbook of many tabs, under its title", () => {
    expect(findStaffTable(workbook([base]))?.[0]).toEqual(HEAD);
  });

  it("takes confirmed staff only, with their registration id, phone, division and bunk", () => {
    const grid = findStaffTable(workbook([base, { ...base, "First Name": "Mendel", STATUS: "Accepted – pending confirmation" }, { ...base, "First Name": "Yossi", STATUS: "Withdrew" }]))!;
    const r = readMasterSheet(grid, divisions);
    expect(r.rows).toHaveLength(1);
    expect(r.skipped.map((s) => s.status).sort()).toEqual(["Accepted – pending confirmation", "Withdrew"]);
    expect(r.rows[0]).toMatchObject({ sourceId: "3391", name: "Levi Cohen", phone: "7185550100", where: "Division 2", bunk: "Bunk כו", signs: "no" });
    // the person's answers, not the office's bookkeeping
    expect(r.rows[0].details).toEqual({ "Hebrew Name": "לוי", "Division (name tag)": "Division 2" });
  });

  it("reads the role from the badge position, keeping titles that say more", () => {
    const grid = findStaffTable(workbook([base, { ...base, "Position (badge)": "Head Kloli" }, { ...base, "Position (badge)": "EMT" }, { ...base, "Position (badge)": "Virtual Counselor" }]))!;
    const rows = readMasterSheet(grid, divisions).rows;
    expect(rows.map((x) => [x.role, x.title])).toEqual([
      ["Counselor", ""],
      ["Head Kloli", "Head Kloli"],
      ["", "EMT"],
      ["Virtual Counselor", "Virtual Counselor"],
    ]);
  });

  it("matches divisions written a little differently; teams that aren't divisions stay details", () => {
    expect(divisionFor("Bar Mitzva Program", divisions)).toBe("Bar Mitzvah Program");
    expect(divisionFor("Logistics", divisions)).toBeNull();
    const grid = findStaffTable(workbook([{ ...base, Division: "Finale Team" }, { ...base, Division: "All Access" }]))!;
    const [team, all] = readMasterSheet(grid, divisions).rows;
    expect(team).toMatchObject({ where: "", bunk: "" });
    expect(team.details["Division (name tag)"]).toBe("Finale Team");
    expect(all.details["Division (name tag)"]).toBe("All Access");
    expect(all.where).toBe("All");
  });

  it("places them in their bunk by number when the names differ, and two sharing an email both come in", () => {
    const grid = findStaffTable(workbook([base, { ...base, "First Name": "Shmuli", "Boldrr ID": "3392" }]))!;
    const [a, b] = planRows(readMasterSheet(grid, divisions).rows, tree, { role: "staff", level: "role" });
    expect(a).toMatchObject({ errors: [], areaText: "Division 2 · Bunk 26", role: "counselor", login: "none" });
    expect(b.errors).toEqual([]);
    expect(b.email).toBe("");
    expect(b.warnings[0]).toMatch(/Same email/);
  });
});

describe("the Badge Export tab", () => {
  const grid = [
    ["Badge Export — the seven columns the badge system expects", "", ""],
    ["Everyone whose STATUS is Confirmed appears here automatically.", "", ""],
    [""],
    ["kinus_id", "staff_id", "first_name", "last_name", "position", "division", "bunk"],
    ["29", "KTH87-028", "Ezriel", "Traurig", "Counselor", "Division 2", "Bunk כו"],
    ["29", "KTH87-100", "Shmuel", "Katz", "Logistics Coordinator", "Logistics", ""],
  ];
  it("is found and read: everyone on it is confirmed", () => {
    const table = findStaffTable([{ name: "Badge Export", grid }]);
    expect(table?.[0][0]).toBe("kinus_id");
    const { rows, skipped } = readMasterSheet(table!, ["Division 1", "Division 2"]);
    expect(skipped).toEqual([]);
    expect(rows.map((r) => [r.sourceId, r.name, r.role, r.where, r.bunk])).toEqual([
      ["KTH87-028", "Ezriel Traurig", "Counselor", "Division 2", "Bunk כו"],
      ["KTH87-100", "Shmuel Katz", "Logistics Coordinator", "", ""],
    ]);
    expect(rows[1].title).toBe("Logistics Coordinator");
    expect(rows[1].details).toEqual({ "Division (name tag)": "Logistics" });
  });
  it("comes after the MASTER tab in the same workbook", () => {
    const master = [["First Name", "Last Name", "Phone", "STATUS"], ["A", "B", "5551234567", "Confirmed"]];
    expect(findStaffTable([{ name: "Badge Export", grid }, { name: "MASTER", grid: master }])?.[0][0]).toBe("First Name");
  });
});
