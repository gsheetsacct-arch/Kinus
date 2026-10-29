import type { BulkInputRow } from "./bulk";
import { matchRole } from "./bulk";
import { countryName, stateCode } from "@/lib/address-codes";

/** The staff export from registration ("Main Program Report"): ppa.*, students.*, group_types.*, applications.* columns. */
export type StaffAddress = { street: string; city: string; state: string; zip: string; country: string };
export type ExportRow = BulkInputRow & { sourceId: string; address: StaffAddress | null; details: Record<string, string> };
export type ExportRead = { rows: ExportRow[]; skipped: { status: string; count: number }[] };

/**
 * Only confirmed staff come in ("Accepted - Confirmed", "Kloli Accepted - Confirmed"); anyone
 * accepted but not yet confirmed, still applying, waiting or turned down is left out.
 */
export function isAccepted(status: string): boolean {
  const s = status.trim().toLowerCase();
  if (/^(accepted|approved|hired)$/.test(s)) return true;
  return /\baccepted\b/.test(s) && /\bconfirmed\b/.test(s) && !/pending|unconfirmed|not (accepted|confirmed)/.test(s);
}

/** The role a status names before "Accepted" ("Kloli Accepted - Confirmed" → kloli), if any. */
const statusRole = (status: string) => matchRole(status.split(/\baccepted\b/i)[0].replace(/[-–:]+$/, ""));

// "ppa.phone_number_we_can_reach_you" → "phone number we can reach you"
const key = (h: string) => h.trim().toLowerCase().replace(/^(ppa|students|group_types|applications|programs)\./, "").replace(/[_]+/g, " ").trim();
const label = (h: string) => {
  const k = key(h).replace(/\s*\/\s*/g, " / ");
  return k.charAt(0).toUpperCase() + k.slice(1);
};

/** Whether this grid is the registration staff export (rather than a hand-made sheet). */
export function isStaffExport(grid: string[][]): boolean {
  const head = (grid[0] ?? []).map((h) => String(h ?? "").trim().toLowerCase());
  return head.includes("students.id") && head.some((h) => h.startsWith("ppa."));
}

// what each Kinus field is read from, best first
const FIELDS = {
  id: ["students.id"],
  first: ["ppa.first_name"],
  last: ["ppa.last_name"],
  email: ["ppa.email_address"],
  // "cell phone" is a yes/no question on the form; the numbers are in the others
  phone: ["ppa.cell_phone", "ppa.phone_number_we_can_reach_you", "ppa.phone_number"],
  role: ["group_types.staff"],
  position: ["ppa.position", "ppa.other_position_kinus"],
  division: ["group_types.division"],
  bunk: ["group_types.bunks"],
  status: ["applications.status"],
  street: ["ppa.home_address"],
  city: ["ppa.city"],
  state: ["ppa.state"],
  zip: ["ppa.zip_code"],
  country: ["ppa.country"],
};
// read into the fields above, so not repeated among the other details
const USED = new Set(Object.values(FIELDS).flat());
// what the form asks rather than says about the person
const NOT_DETAILS = new Set(["students.role", "applications.last_step_number", "applications.last_step_name", "programs.name"]);

const looksLikePhone = (s: string) => s.replace(/\D/g, "").length >= 7;

/**
 * The accepted staff in a registration export, as rows for the bulk add. Columns empty on every
 * row are dropped; any other column with something in it is kept in `details`.
 */
export function readStaffExport(grid: string[][]): ExportRead {
  const [headRow, ...body] = grid;
  const head = (headRow ?? []).map((h) => String(h ?? "").trim());
  const lower = head.map((h) => h.toLowerCase());
  const rows = body.map((r) => head.map((_, i) => String(r[i] ?? "").trim())).filter((r) => r.some((c) => c !== ""));
  const filled = new Set(head.map((_, i) => i).filter((i) => rows.some((r) => r[i] !== "")));
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
    const status = at(r, FIELDS.status);
    if (!isAccepted(status)) {
      const s = status || "No status";
      skipped.set(s, (skipped.get(s) ?? 0) + 1);
      return;
    }
    const groupRole = at(r, FIELDS.role);
    // the role: the staff group, else what the status says they were accepted as, else (planRows) their position
    const role = matchRole(groupRole) ? groupRole : (statusRole(status) ?? "");
    const details: Record<string, string> = {};
    head.forEach((h, i) => {
      if (!filled.has(i) || USED.has(lower[i]) || NOT_DETAILS.has(lower[i]) || !r[i]) return;
      details[label(h)] = r[i];
    });
    // a staff group Kinus doesn't know as a role stays a detail
    if (groupRole && !matchRole(groupRole)) details["Staff group"] = groupRole;
    const address = { street: at(r, FIELDS.street), city: at(r, FIELDS.city), state: at(r, FIELDS.state), zip: at(r, FIELDS.zip), country: at(r, FIELDS.country) };
    out.push({
      line: n + 2,
      sourceId: at(r, FIELDS.id),
      name: [at(r, FIELDS.first), at(r, FIELDS.last)].filter(Boolean).join(" "),
      email: at(r, FIELDS.email).toLowerCase(),
      role,
      // a position Kinus knows ("Counselor") is used as the role (planRows); anything else is their position
      title: at(r, FIELDS.position),
      phone: at(r, FIELDS.phone, looksLikePhone),
      where: at(r, FIELDS.division),
      bunk: at(r, FIELDS.bunk),
      level: "",
      // from registration everyone new is listed (phone book, lists, texts); sign-in is turned on per person
      signs: "no",
      address: Object.values(address).some(Boolean) ? address : null,
      details,
    });
  });
  return { rows: out, skipped: [...skipped].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count) };
}

/** "4 Main Street, Brooklyn, NY 11213" (the country only outside the USA) */
export const addressLine = (a: Partial<StaffAddress> | null | undefined) => {
  if (!a) return "";
  const country = countryName(a.country);
  return [a.street, a.city, [stateCode(a.state), a.zip].filter(Boolean).join(" "), country === "USA" ? "" : country].filter(Boolean).join(", ");
};
