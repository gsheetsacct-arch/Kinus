import { DIVISION_VALUE } from "./types";
import { countryName, stateCode } from "@/lib/address-codes";

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
export const STAFF_FIELDS: { key: string; label: string }[] = [
  { key: "FIRST", label: "First name" },
  { key: "LAST", label: "Last name" },
  { key: "FULL", label: "Full name" },
  { key: "HEBREW_NAME", label: "Hebrew name (registration)" },
  { key: "POSITION", label: "Position (Learning head, Waterfront…)" },
  { key: "ROLE", label: "Role in Kinus (Counselor, Head counselor…)" },
  { key: "DIVISION", label: "Division" },
  { key: "BUNK", label: "Bunk" },
  { key: "CAMP", label: "Camp" },
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
  places: { division: string; color: string | null; camp: string | null; bunk: string | null }[];
};

const detail = (d: Record<string, string> | null | undefined, ...names: string[]) => {
  for (const n of names) for (const [k, v] of Object.entries(d ?? {})) if (k.toLowerCase() === n.toLowerCase() && v) return v;
  return "";
};
const unique = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];

/** One staff member's values for a staff tag. "Levi Yitzchak Cohen": first "Levi Yitzchak", last "Cohen". */
export function staffValues(p: StaffPerson, roleLabel: (role: string) => string): Record<string, string> {
  const words = p.name.trim().split(/\s+/).filter(Boolean);
  const first = words.length > 1 ? words.slice(0, -1).join(" ") : (words[0] ?? "");
  const last = words.length > 1 ? words[words.length - 1] : "";
  const divisions = unique(p.places.map((x) => x.division));
  return {
    FIRST: first,
    LAST: last,
    FULL: words.join(" "),
    HEBREW_NAME: detail(p.details, "Full hebrew name", "Hebrew name"),
    POSITION: p.title ?? "",
    ROLE: roleLabel(p.role),
    DIVISION: divisions.join(", "),
    BUNK: unique(p.places.map((x) => x.bunk)).join(", "),
    CAMP: unique(p.places.map((x) => x.camp)).join(", "),
    DIVISION_COLOR: p.places.find((x) => x.color)?.color ?? "#64748b",
    PHONE: p.phone ?? "",
    EMAIL: p.email ?? "",
    TSHIRT: detail(p.details, "T-shirt size", "Tshirt size"),
    // states and countries the same way on every tag: NY, USA (lib/address-codes)
    ADDRESS: p.address?.street ?? "",
    CITY: p.address?.city ?? "",
    STATE: stateCode(p.address?.state),
    ZIP: p.address?.zip ?? "",
    COUNTRY: countryName(p.address?.country),
    STAFF_ID: p.sourceId ?? "",
    // a picture part with a different picture per division goes by the first one
    [DIVISION_VALUE]: divisions[0] ?? "",
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
  details: { "Full hebrew name": "מנחם מענדל", "T-shirt size": "L" },
  address: { street: "770 Eastern Parkway", city: "Brooklyn", state: "New York", zip: "11213", country: "United States" },
  places: [{ division: "Division 2", color: "#2563eb", camp: "American", bunk: "Bunk Lamed" }],
};
