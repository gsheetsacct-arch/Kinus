import { DIVISION_VALUE } from "./types";
import { countryName, stateCode } from "@/lib/address-codes";
import { findNumber } from "@/lib/hebrew-number";

/** Who a template is for (migration 0041): campers, or staff (Print → Staff tags). */
export type Audience = "campers" | "staff";
export const audienceOf = (t: unknown): Audience => ((t as { audience?: string } | null)?.audience === "staff" ? "staff" : "campers");
/** Camper templates: offered on camper cards, at check-in, in batches and in the queue. */
export const forCampers = (t: unknown) => audienceOf(t) === "campers";

/**
 * What a staff tag can say. The camper names are reused where they mean the same thing
 * ({{FIRST}}, {{DIVISION}}, {{BUNK}}, {{DIVISION_COLOR}}), so a camper tag copied for staff
 * mostly just works.
 */
export const STAFF_FIELDS: { key: string; label: string; /** what it says for someone it applies to (the sample person isn't) */ sample?: string }[] = [
  { key: "FIRST", label: "First name" },
  { key: "LAST", label: "Last name" },
  { key: "FULL", label: "Full name" },
  { key: "HEBREW_NAME", label: "Hebrew name (registration)" },
  { key: "HEBREW_LAST", label: "Hebrew last name (registration)" },
  { key: "POSITION", label: "Position (Learning head, Waterfront…)" },
  { key: "ROLE", label: "Role in Kinus (Counselor, Head counselor…)" },
  { key: "BUNK_HE", label: "Bunk as the Hebrew campers' tags say it (סיירת 101), for the Hebrew camps' staff (empty otherwise: use {{BUNK_HE|BUNK}})", sample: "סיירת 101" },
  { key: "ROLE_HE", label: "Role in Hebrew, for the Hebrew camps' staff (מדריך, גנרל, מנהל; empty otherwise: use {{ROLE_HE|ROLE}})", sample: "מדריך" },
  { key: "DIVISION", label: "Division" },
  { key: "BUNK", label: "Bunk" },
  { key: "CAMP", label: "Camp" },
  { key: "BUNK_CONTINUED", label: "Number: one per division, after the last bunk number" },
  { key: "DIVISION_COLOR", label: "Division colour" },
  { key: "PHONE", label: "Phone" },
  { key: "EMAIL", label: "Email" },
  { key: "TSHIRT", label: "T-shirt size (registration)" },
  { key: "ADDRESS", label: "Street address (registration)" },
  { key: "CITY", label: "City (registration)" },
  { key: "STATE", label: "State, as its code: NY (registration)" },
  { key: "ZIP", label: "Zip code (registration)" },
  { key: "COUNTRY", label: "Country: USA… (registration)" },
  { key: "STAFF_ID", label: "Registration id" },
];

export type StaffPerson = {
  name: string;
  role: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  sourceId?: string | null;
  details?: Record<string, string> | null;
  /** Home address from registration (lib/staff/export). */
  address?: { street?: string; city?: string; state?: string; zip?: string; country?: string } | null;
  /** Where they work, in order: their division(s), with the bunk if they have one. */
  places: { division: string; color: string | null; camp: string | null; bunk: string | null; number?: number | null }[];
};

const detail = (d: Record<string, string> | null | undefined, ...names: string[]) => {
  for (const n of names) for (const [k, v] of Object.entries(d ?? {})) if (k.toLowerCase() === n.toLowerCase() && v) return v;
  return "";
};
const unique = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];

/** The roles with a Hebrew word on the Hebrew camps' badges (the rest print in English). */
const ROLE_HEBREW: Record<string, string> = { counselor: "מדריך", head_counselor: "גנרל", director: "מנהל" };
/** A Hebrew camp bunk as the campers' tags number it: the bunk's letter, 101 and up (א 101, ב 102…). */
const hebrewBunk = (bunk: string | null) => {
  const n = bunk ? findNumber(bunk)?.value : undefined;
  return n ? `סיירת ${100 + n}` : null;
};
/** Works in the Hebrew camp or the Thursday Program's Hebrew one (by camp, division or the name-tag division). */
const inHebrewCamp = (p: StaffPerson) =>
  p.places.some((x) => /hebrew|עברית/i.test(`${x.camp ?? ""} ${x.division}`)) || /hebrew|עברית/i.test(detail(p.details, "Division (name tag)"));

// the export's column prefixes (lib/staff/export keeps the answers by their wording: "Full hebrew name")
const PREFIXES = ["ppa", "students", "group_types", "applications", "programs"];

/**
 * The registration answers under the export's own column names too, as a camper tag would
 * write them: "Full hebrew name" is {{source.ppa.full_hebrew_name}} and {{ppa.full_hebrew_name}}.
 */
function byColumn(details: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [label, v] of Object.entries(details ?? {})) {
    if (!v) continue;
    const column = label.trim().toLowerCase().replace(/\s*\/\s*/g, "_/_").replace(/\s+/g, "_");
    for (const p of PREFIXES) out[`source.${p}.${column}`] = out[`${p}.${column}`] = v;
  }
  return out;
}

/** One staff member's values for a staff tag. "Levi Yitzchak Cohen": first "Levi Yitzchak", last "Cohen". */
export function staffValues(p: StaffPerson, roleLabel: (role: string) => string): Record<string, string> {
  const words = p.name.trim().split(/\s+/).filter(Boolean);
  const first = words.length > 1 ? words.slice(0, -1).join(" ") : (words[0] ?? "");
  const last = words.length > 1 ? words[words.length - 1] : "";
  const divisions = unique(p.places.map((x) => x.division));
  // the division the office's staff sheet gives for the name tag ("Ohel Rally", "All Access"), else where they work in Kinus
  const tagDivision = detail(p.details, "Division (name tag)");
  return {
    ...byColumn(p.details),
    FIRST: first,
    LAST: last,
    FULL: words.join(" "),
    HEBREW_NAME: detail(p.details, "Full hebrew name", "Hebrew name"),
    HEBREW_LAST: detail(p.details, "Last name (Hebrew)", "Hebrew last name"),
    POSITION: p.title ?? "",
    ROLE: roleLabel(p.role),
    // the Hebrew camps' staff: their role in Hebrew, where there's a word for it (the English role stays as it is)
    ROLE_HE: inHebrewCamp(p) ? (ROLE_HEBREW[p.role] ?? "") : "",
    // the division on the office's staff sheet ("Ohel Rally", "All Access"), else where they work in Kinus
    DIVISION: tagDivision || divisions.join(", "),
    BUNK: unique(p.places.map((x) => x.bunk)).join(", "),
    // the Hebrew camps' staff: their bunk as the campers' tags say it ("Bunk א עברית" → "סיירת 101"); BUNK stays as it is
    BUNK_HE: inHebrewCamp(p) ? unique(p.places.map((x) => hebrewBunk(x.bunk))).join(", ") : "",
    CAMP: unique(p.places.map((x) => x.camp)).join(", "),
    // the division's number, running on after the last bunk's (lib/print/bunk-continued): as a camper's {{BUNK_CONTINUED}}
    BUNK_CONTINUED: String(p.places.find((x) => x.number)?.number ?? ""),
    DIVISION_COLOR: p.places.find((x) => x.color)?.color ?? "#64748b",
    PHONE: p.phone ?? "",
    EMAIL: p.email ?? "",
    TSHIRT: detail(p.details, "T-shirt size", "Tshirt size", "Shirt size"),
    // states and countries the same way on every tag: NY, USA (lib/address-codes)
    ADDRESS: p.address?.street ?? "",
    CITY: p.address?.city ?? "",
    STATE: stateCode(p.address?.state),
    ZIP: p.address?.zip ?? "",
    COUNTRY: countryName(p.address?.country),
    STAFF_ID: p.sourceId ?? "",
    // a picture part with a different picture per division goes by the name tag's division
    // (the badge's design matches what it says), else the first division they work in
    [DIVISION_VALUE]: tagDivision || (divisions[0] ?? ""),
  };
}

/** The made-up staff member previews start with. */
export const SAMPLE_STAFF: StaffPerson = {
  name: "Menachem Mendel Goldberg",
  role: "head_counselor",
  title: "Learning head",
  phone: "(718) 555-0123",
  email: "mendel@example.org",
  sourceId: "1234",
  details: { "Full hebrew name": "מנחם מענדל", "Last name (Hebrew)": "כהן", "T-shirt size": "L" },
  address: { street: "770 Eastern Parkway", city: "Brooklyn", state: "New York", zip: "11213", country: "United States" },
  places: [{ division: "Division 2", color: "#2563eb", camp: "American", bunk: "Bunk Lamed", number: 142 }],
};
