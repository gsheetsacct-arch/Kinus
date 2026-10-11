import { STAFF_ROLES } from "@/lib/labels";
import type { StaffRole } from "@/lib/auth/permissions";
import type { AreaTree } from "@/lib/data/areas";

export const TEMPLATE_HEADERS = ["Name", "Email", "Role", "Division", "Bunk", "Position", "Phone"];

/** Example rows for the bulk-add sheet, using this person's own divisions, bunks and roles. */
export function templateRows(tree: AreaTree, roles: StaffRole[]): string[][] {
  const d = tree.divisions[0];
  const d2 = tree.divisions[1];
  const multi = tree.divisions.length > 1;
  const div = (x?: { name: string }) => (multi && x ? x.name : "");
  const can = (r: StaffRole) => roles.includes(r);
  const rows: string[][] = [];
  if (can("counselor")) {
    rows.push(["Levi Cohen", "levi.cohen@example.com", STAFF_ROLES.counselor.label, div(d), d?.bunks[0]?.name ?? "", "", "+1 718 555 0101"]);
    if (d && d.bunks.length > 2) rows.push(["Mendy Gurary", "mendy@example.com", STAFF_ROLES.counselor.label, div(d), `${d.bunks[1].name}; ${d.bunks[2].name}`, "Learning head", "+1 718 555 0102"]);
  }
  if (can("scanner")) rows.push(["Gate Helper", "helper@example.com", STAFF_ROLES.scanner.label, div(d), "", "Check-in table", ""]);
  if (can("head_counselor") && d2) rows.push(["Shmuli Levin", "shmuli@example.com", STAFF_ROLES.head_counselor.label, d2.name, "", "", "+1 917 555 0103"]);
  return rows;
}

export const toCsv = (rows: string[][]) => "﻿" + rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n") + "\r\n";
