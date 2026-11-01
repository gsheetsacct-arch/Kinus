import { matchRole } from "./bulk";
import type { ExportRead, ExportRow } from "./export";
import { isAccepted, isStaffExport } from "./export";

/**
 * The office's own staff workbook (a MASTER tab: one row per person, "First Name", "Last Name",
 * "Phone", "STATUS", "Position (badge)", "Division", "Bunk #"…), as well as the registration export.
 * A workbook has many tabs and titles above the headers: the table is found wherever it is.
 */

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** A MASTER-style header row: names, a phone and the office's status. */
export const isMasterHeader = (row: unknown[]) => {
  const h = row.map(norm);
  return h.includes("first name") && h.includes("last name") && h.includes("status") && (h.includes("phone") || h.includes("email"));
};

/**
 * The staff table in a workbook: the MASTER tab (the office's decisions) before the raw
 * registration export (which has no divisions or bunks yet), its header row wherever it starts.
 */
export function findStaffTable(sheets: { name: string; grid: string[][] }[]): string[][] | null {
  const headerAt = (grid: string[][], test: (row: string[]) => boolean) => grid.slice(0, 10).findIndex(test);
  for (const s of sheets) {
    const i = headerAt(s.grid, isMasterHeader);
    if (i >= 0) return s.grid.slice(i);
  }
  for (const s of sheets) {
    const i = headerAt(s.grid, (row) => isStaffExport([row]));
    if (i >= 0) return s.grid.slice(i);
  }
  return null;
}

const COLUMNS = {
  sourceId: ["boldrr id", "students.id", "staff id"],
  first: ["first name"],
  last: ["last name"],
  email: ["email"],
  phone: ["phone", "cell phone", "phone number"],
  position: ["position (badge)", "position", "applied for"],
  division: ["division"],
  bunk: ["bunk (hebrew)", "bunk #", "bunk"],
  status: ["status"],
  street: ["home address", "address"],
  city: ["city"],
  state: ["state"],
  zip: ["zip", "zip code"],
  country: ["country"],
};
const USED = new Set(Object.values(COLUMNS).flat());
// the office's bookkeeping, not about the person
const NOT_DETAILS = new Set(["source", "flag", "reviewed by", "office notes", "acceptance sent", "confirmed on", "badge printed", "yeshiva release list", "boldrr status", "boldrr bunk", "boldrr updated", "boldrr division", "agreed to terms", "applied for"]);

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9֐-׿]/g, "");
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** The Kinus division a sheet means ("Bar Mitzva Program" for "Bar Mitzvah Program"), or null for a team that isn't one ("Logistics", "All Access"). */
export function divisionFor(value: string, divisions: string[]): string | null {
  const v = letters(value);
  if (!v) return null;
  return divisions.find((d) => letters(d) === v) ?? divisions.find((d) => v.length > 5 && distance(letters(d), v) <= 2) ?? null;
}

const PLAIN_ROLE = /^(counselor|counsellor|kloli|head counselor|division head|director)$/i;
const looksLikePhone = (s: string) => s.replace(/\D/g, "").length >= 7;

/** The confirmed staff on a MASTER tab, as rows for the bulk add; everyone else is counted by status. */
export function readMasterSheet(grid: string[][], divisions: string[]): ExportRead {
  const [headRow, ...body] = grid;
  const head = (headRow ?? []).map((h) => String(h ?? "").trim());
  const lower = head.map(norm);
  const rows = body.map((r) => head.map((_, i) => String(r[i] ?? "").trim())).filter((r) => r.some((c) => c !== ""));
  const filled = new Set(head.map((_, i) => i).filter((i) => head[i] && rows.some((r) => r[i] !== "")));
  const at = (r: string[], names: string[], ok: (v: string) => boolean = Boolean) => {
    for (const n of names) {
      const i = lower.indexOf(n);
      if (i >= 0 && ok(r[i])) return r[i];
    }
    return "";
  };
  const skipped = new Map<string, number>();
  const out: ExportRow[] = [];
  rows.forEach((r, n) => {
    const first = at(r, COLUMNS.first);
    const last = at(r, COLUMNS.last);
    if (!first && !last) return;
    const status = at(r, COLUMNS.status);
    if (!isAccepted(status)) {
      const s = status || "No status";
      skipped.set(s, (skipped.get(s) ?? 0) + 1);
      return;
    }
    const details: Record<string, string> = {};
    head.forEach((h, i) => {
      if (!filled.has(i) || USED.has(lower[i]) || NOT_DETAILS.has(lower[i]) || !r[i]) return;
      details[h] = r[i];
    });
    // a team that isn't a division here (Logistics, Finale Team, All Access) is kept as a detail
    const group = at(r, COLUMNS.division);
    // "All Access": every division
    const everywhere = /^all( access)?$/i.test(group.trim());
    const division = everywhere ? null : divisionFor(group, divisions);
    if (group && !division && !everywhere) details["Staff group"] = group;
    const position = at(r, COLUMNS.position);
    const address = { street: at(r, COLUMNS.street), city: at(r, COLUMNS.city), state: at(r, COLUMNS.state), zip: at(r, COLUMNS.zip), country: at(r, COLUMNS.country) };
    out.push({
      line: n + 2,
      sourceId: at(r, COLUMNS.sourceId),
      name: [first, last].filter(Boolean).join(" "),
      email: at(r, COLUMNS.email).toLowerCase(),
      // a position Kinus knows ("Head Counselor", "Kloli") is the role; anything else ("EMT") stays their position
      role: matchRole(position) ? position : "",
      // a title that says more than the role ("Virtual Counselor", "Head Kloli", "EMT") is kept
      title: PLAIN_ROLE.test(position) ? "" : position,
      phone: at(r, COLUMNS.phone, looksLikePhone),
      where: everywhere ? "All" : (division ?? ""),
      bunk: division ? at(r, COLUMNS.bunk) : "",
      level: "",
      signs: "no",
      address: Object.values(address).some(Boolean) ? address : null,
      details,
    });
  });
  return { rows: out, skipped: [...skipped].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count) };
}
