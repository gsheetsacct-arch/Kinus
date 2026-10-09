/**
 * Field catalog: every camper field the app can show in lists, cards and exports,
 * with the sensitivity group that `field_visibility` gates.
 */
export type FieldGroup = "basic" | "status" | "contacts" | "medical" | "parent_notes" | "address" | "staff_notes";
export type FieldKind = "text" | "bool" | "status" | "phone" | "email" | "list";

export type FieldDef = { key: string; label: string; group: FieldGroup; kind: FieldKind };

const contact = (slug: string, label: string): FieldDef[] => [
  { key: `contact.${slug}.name`, label: `${label} name`, group: "contacts", kind: "text" },
  { key: `contact.${slug}.phone`, label: `${label} phone`, group: "contacts", kind: "phone" },
  { key: `contact.${slug}.email`, label: `${label} email`, group: "contacts", kind: "email" },
];

export const FIELDS: FieldDef[] = [
  { key: "display_name", label: "Name", group: "basic", kind: "text" },
  { key: "first_name", label: "First name", group: "basic", kind: "text" },
  { key: "last_name", label: "Last name", group: "basic", kind: "text" },
  { key: "camper_code", label: "Code", group: "basic", kind: "text" },
  { key: "source_id", label: "Registration ID", group: "basic", kind: "text" },
  { key: "division", label: "Division", group: "basic", kind: "text" },
  { key: "bunk", label: "Bunk", group: "basic", kind: "text" },
  { key: "grade", label: "Grade", group: "basic", kind: "text" },
  { key: "tshirt_size", label: "T-shirt", group: "basic", kind: "text" },
  { key: "bunk_preferences", label: "Bunk preferences", group: "basic", kind: "list" },
  { key: "status", label: "Status", group: "status", kind: "status" },
  { key: "in_latest_import", label: "In latest export", group: "status", kind: "bool" },
  { key: "has_medical_flag", label: "Medical flag", group: "basic", kind: "bool" },
  { key: "has_allergies", label: "Has allergies", group: "medical", kind: "bool" },
  { key: "allergies", label: "Allergy details", group: "medical", kind: "text" },
  { key: "has_epipen", label: "EpiPen", group: "medical", kind: "bool" },
  { key: "has_medications", label: "Medications", group: "medical", kind: "bool" },
  { key: "medical_notes", label: "Medical notes", group: "medical", kind: "text" },
  { key: "notes_from_parents", label: "Notes from parents", group: "parent_notes", kind: "text" },
  { key: "local_address", label: "Local address", group: "address", kind: "text" },
  { key: "local_address_cross_streets", label: "Cross streets", group: "address", kind: "text" },
  { key: "staff_notes", label: "Staff notes", group: "staff_notes", kind: "text" },
  ...contact("mother", "Mother"),
  ...contact("father", "Father"),
  ...contact("emergency1", "Emergency 1"),
  ...contact("emergency2", "Emergency 2"),
];

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

/** Groups that are always visible (not gated by field_visibility). */
export const UNGATED_GROUPS: FieldGroup[] = ["basic", "status"];

/**
 * The sensitivity group a merge key reads from. Raw registration columns ("source.…") carry
 * no group of their own, so anything that looks medical, like an address or like parent
 * contact details is treated as that group; the rest is basic.
 */
export function groupOfKey(key: string): FieldGroup {
  if (key.startsWith("contact.")) return "contacts";
  if (!key.startsWith("source.")) return FIELD_BY_KEY[key]?.group ?? "basic";
  const col = key.slice(7).toLowerCase();
  if (/medic|allerg|epi.?pen|diet|condition|diagnos|dosage|health|insur|trauma|doctor|physician|treatment/.test(col)) return "medical";
  if (/address|street|zip|postal/.test(col)) return "address";
  if (/phone|cell|mobile|email|e-mail|mother|father|parent|guardian|emergency|contact/.test(col)) return "contacts";
  if (/note|comment/.test(col)) return "parent_notes";
  return "basic";
}

export type ContactLike = { role: string; slot: number; name: string | null; phone: string | null; phone_e164: string | null; email: string | null };

export type CamperLike = {
  [k: string]: unknown;
  division_name?: string | null;
  bunk_name?: string | null;
  contacts?: ContactLike[];
  bunk_preferences?: string[] | null;
};

const CONTACT_SLUGS: Record<string, { role: string; slot: number }> = {
  mother: { role: "mother", slot: 1 },
  father: { role: "father", slot: 1 },
  emergency1: { role: "emergency", slot: 1 },
  emergency2: { role: "emergency", slot: 2 },
};

/** Reads a catalog field off a camper row (+ contacts). Returns display-ready primitives. */
export function getFieldValue(c: CamperLike, key: string): string | boolean | null {
  if (key.startsWith("contact.")) {
    const [, slug, prop] = key.split(".");
    const target = CONTACT_SLUGS[slug];
    const k = c.contacts?.find((x) => x.role === target.role && x.slot === target.slot);
    if (!k) return null;
    if (prop === "phone") return k.phone_e164 ?? k.phone ?? null;
    return (k as unknown as Record<string, string | null>)[prop] ?? null;
  }
  if (key === "division") return c.division_name ?? null;
  if (key === "bunk") return c.bunk_name ?? null;
  if (key === "bunk_preferences") return (c.bunk_preferences ?? []).filter(Boolean).join(", ") || null;
  const v = c[key];
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v;
  return String(v);
}
