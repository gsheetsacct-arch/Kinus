import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { normText } from "./normalize";

export type ColumnMap = Record<string, string>;
export type MappingOptions = {
  bunkColumnPriority?: string[];
  booleanYes?: string[];
  booleanNo?: string[];
  phoneDefaultRegion?: string;
  emptyMeansUnknown?: boolean;
};

export type ContactRole = "mother" | "father" | "guardian" | "emergency" | "host" | "authorized_pickup";
export type ParsedContact = {
  role: ContactRole;
  slot: number;
  name: string | null;
  phone: string | null;
  phone_e164: string | null;
  email: string | null;
};

export type ParsedCamper = {
  source_id: string | null;
  first_name: string;
  last_name: string;
  division_name: string | null;
  bunk_name: string | null;
  /** Every division / bunk the export listed for this camper (comma-separated values). */
  division_candidates: string[];
  bunk_candidates: string[];
  grade: string | null;
  tshirt_size: string | null;
  bunk_preferences: string[];
  local_address: string | null;
  local_address_cross_streets: string | null;
  medical_notes: string | null;
  allergies: string | null;
  has_allergies: boolean | null;
  has_epipen: boolean | null;
  has_medications: boolean | null;
  notes_from_parents: string | null;
  contacts: ParsedContact[];
  source_data: Record<string, string>;
  warnings: string[];
};

export const SCALAR_TARGETS = [
  "source_id",
  "first_name",
  "last_name",
  "division",
  "bunk",
  "grade",
  "tshirt_size",
  "local_address",
  "local_address_cross_streets",
  "medical_notes",
  "allergies",
  "has_allergies",
  "has_epipen",
  "has_medications",
  "notes_from_parents",
] as const;

/** Options for the mapping UI dropdown. */
export const TARGET_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "— keep in raw data only —" },
  ...SCALAR_TARGETS.map((t) => ({ value: t, label: t })),
  { value: "bunk_preferences[0]", label: "bunk preference 1" },
  { value: "bunk_preferences[1]", label: "bunk preference 2" },
  { value: "bunk_preferences[2]", label: "bunk preference 3" },
  ...(["mother", "father", "guardian", "host"] as const).flatMap((r) => [
    { value: `contact[${r}].name`, label: `${r}: name` },
    { value: `contact[${r}].first_name`, label: `${r}: first name` },
    { value: `contact[${r}].last_name`, label: `${r}: last name` },
    { value: `contact[${r}].phone`, label: `${r}: phone` },
    { value: `contact[${r}].email`, label: `${r}: email` },
  ]),
  ...[1, 2, 3].flatMap((n) => [
    { value: `contact[emergency,${n}].name`, label: `emergency ${n}: name` },
    { value: `contact[emergency,${n}].phone`, label: `emergency ${n}: phone` },
    { value: `contact[emergency,${n}].email`, label: `emergency ${n}: email` },
  ]),
];

/** "Division 3,Division 2" → ["Division 3", "Division 2"]; de-duplicated, order kept. */
export function splitList(v: string | null): string[] {
  if (!v) return [];
  return [...new Set(v.split(",").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

const CONTACT_RE = /^contact\[(\w+)(?:,(\d+))?\]\.(name|first_name|last_name|phone|email)$/;
const PREF_RE = /^bunk_preferences\[(\d+)\]$/;

export function parseBoolean(v: string | undefined, opts: MappingOptions): { value: boolean | null; warning?: string } {
  const t = (v ?? "").trim().toLowerCase();
  if (t === "") return { value: null };
  if ((opts.booleanYes ?? ["yes", "y", "true"]).includes(t)) return { value: true };
  if ((opts.booleanNo ?? ["no", "n", "false"]).includes(t)) return { value: false };
  return { value: null, warning: `unrecognised yes/no value "${v}"` };
}

export function parsePhone(raw: string | null, region: string): string | null {
  if (!raw) return null;
  const pn = parsePhoneNumberFromString(raw, region as CountryCode);
  return pn?.number ?? null;
}

/** Applies a column map to one raw row. Pure; never throws on bad data, records warnings instead. */
export function applyMapping(row: Record<string, string>, map: ColumnMap, opts: MappingOptions): ParsedCamper {
  const warnings: string[] = [];
  const out: ParsedCamper = {
    source_id: null,
    first_name: "",
    last_name: "",
    division_name: null,
    bunk_name: null,
    division_candidates: [],
    bunk_candidates: [],
    grade: null,
    tshirt_size: null,
    bunk_preferences: [],
    local_address: null,
    local_address_cross_streets: null,
    medical_notes: null,
    allergies: null,
    has_allergies: null,
    has_epipen: null,
    has_medications: null,
    notes_from_parents: null,
    contacts: [],
    source_data: { ...row },
    warnings,
  };
  const contacts = new Map<string, ParsedContact & { first?: string | null; last?: string | null }>();
  const contactKey = (role: string, slot: number) => `${role}:${slot}`;
  const getContact = (role: string, slot: number) => {
    const k = contactKey(role, slot);
    if (!contacts.has(k)) contacts.set(k, { role: role as ContactRole, slot, name: null, phone: null, phone_e164: null, email: null });
    return contacts.get(k)!;
  };

  // bunk: first non-empty among the prioritised columns, then any other column mapped to "bunk"
  const bunkCols = [
    ...(opts.bunkColumnPriority ?? []),
    ...Object.keys(map).filter((c) => map[c] === "bunk" && !(opts.bunkColumnPriority ?? []).includes(c)),
  ];
  for (const col of bunkCols) {
    const v = normText(row[col]);
    if (v) {
      out.bunk_candidates = splitList(v);
      out.bunk_name = out.bunk_candidates[0] ?? null;
      break;
    }
  }

  for (const [col, target] of Object.entries(map)) {
    if (!target || target === "bunk") continue;
    const raw = row[col];
    const text = normText(raw);
    const m = CONTACT_RE.exec(target);
    if (m) {
      const c = getContact(m[1], m[2] ? Number(m[2]) : 1);
      const prop = m[3];
      if (prop === "phone") {
        c.phone = text;
        c.phone_e164 = parsePhone(text, opts.phoneDefaultRegion ?? "US");
        if (text && !c.phone_e164) warnings.push(`could not parse phone "${text}" (${col})`);
      } else if (prop === "first_name") c.first = text;
      else if (prop === "last_name") c.last = text;
      else if (prop === "name") c.name = text;
      else if (prop === "email") c.email = text?.toLowerCase() ?? null;
      continue;
    }
    const p = PREF_RE.exec(target);
    if (p) {
      if (text) out.bunk_preferences[Number(p[1])] = text;
      continue;
    }
    switch (target) {
      case "source_id":
        out.source_id = text;
        break;
      case "first_name":
        out.first_name = text ?? "";
        break;
      case "last_name":
        out.last_name = text ?? "";
        break;
      case "division":
        out.division_candidates = splitList(text);
        out.division_name = out.division_candidates[0] ?? null;
        break;
      case "has_allergies":
      case "has_epipen":
      case "has_medications": {
        const b = parseBoolean(raw, opts);
        out[target] = b.value;
        if (b.warning) warnings.push(`${b.warning} (${col})`);
        break;
      }
      case "grade":
      case "tshirt_size":
      case "local_address":
      case "local_address_cross_streets":
      case "medical_notes":
      case "allergies":
      case "notes_from_parents":
        out[target] = text;
        break;
      default:
        warnings.push(`unknown mapping target "${target}" for column "${col}"`);
    }
  }
  out.bunk_preferences = out.bunk_preferences.filter((x): x is string => Boolean(x));
  for (const c of contacts.values()) {
    if (!c.name && (c.first || c.last)) c.name = [c.first, c.last].filter(Boolean).join(" ");
    const { first: _f, last: _l, ...rest } = c;
    void _f;
    void _l;
    if (rest.name || rest.phone || rest.email) out.contacts.push(rest);
  }
  if (!out.first_name && !out.last_name) warnings.push("row has no name");
  return out;
}
