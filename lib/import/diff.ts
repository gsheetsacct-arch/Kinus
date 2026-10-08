import type { ParsedCamper } from "./mapping";
import { normalizeName, normText } from "./normalize";

export type ExistingContact = {
  role: string;
  slot: number;
  name: string | null;
  phone: string | null;
  phone_e164: string | null;
  email: string | null;
  source: string;
};

export type ExistingCamper = {
  id: string;
  source_id: string | null;
  first_name: string;
  last_name: string;
  division_name: string | null;
  bunk_name: string | null;
  bunk_locked_by_staff: boolean;
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
  contacts: ExistingContact[];
};

export type FieldChange = { field: string; old: string | null; new: string | null };
export type RowAction = "add" | "update" | "unchanged" | "conflict" | "skip";
export type Candidate = { id: string; display_name: string; division_name: string | null };

export type RowResult = {
  rowNumber: number;
  parsed: ParsedCamper;
  matchedCamperId: string | null;
  matchMethod: "source_id" | "name" | null;
  action: RowAction;
  changes: FieldChange[];
  warnings: string[];
  candidates?: Candidate[];
};

export type DiffOptions = { takeBunksFromFile: boolean; emptyMeansUnknown: boolean };

export type DiffSummary = {
  added: number;
  updated: number;
  unchanged: number;
  conflicts: number;
  skipped: number;
  missing: Candidate[];
  divisionsInFile: string[];
  newDivisions: string[];
  newBunks: string[];
};

const TEXT_FIELDS = [
  "first_name",
  "last_name",
  "grade",
  "tshirt_size",
  "local_address",
  "local_address_cross_streets",
  "medical_notes",
  "allergies",
  "notes_from_parents",
] as const;
const BOOL_FIELDS = ["has_allergies", "has_epipen", "has_medications"] as const;

const boolStr = (b: boolean | null | undefined) => (b === null || b === undefined ? null : b ? "true" : "false");

function diffOne(parsed: ParsedCamper, ex: ExistingCamper, opts: DiffOptions): { changes: FieldChange[]; warnings: string[] } {
  const changes: FieldChange[] = [];
  const warnings: string[] = [];
  const skipEmpty = opts.emptyMeansUnknown;

  for (const f of TEXT_FIELDS) {
    const nv = normText(parsed[f]);
    const ov = normText(ex[f]);
    if (nv === null && skipEmpty) continue;
    if (nv !== ov) changes.push({ field: f, old: ov, new: nv });
  }
  for (const f of BOOL_FIELDS) {
    const nv = parsed[f];
    if (nv === null && skipEmpty) continue;
    if (nv !== ex[f]) changes.push({ field: f, old: boolStr(ex[f]), new: boolStr(nv) });
  }

  const newDiv = normText(parsed.division_name);
  const oldDiv = normText(ex.division_name);
  const divisionChanged = newDiv !== null && newDiv !== oldDiv;
  if (divisionChanged) {
    changes.push({ field: "division", old: oldDiv, new: newDiv });
    // apply re-resolves the bunk inside the new division from parsed.bunk_name
    if (normText(parsed.bunk_name) !== normText(ex.bunk_name)) {
      changes.push({ field: "bunk", old: normText(ex.bunk_name), new: normText(parsed.bunk_name) });
    }
  } else {
    const nb = normText(parsed.bunk_name);
    const ob = normText(ex.bunk_name);
    if (!(nb === null && skipEmpty) && nb !== ob) {
      if (ex.bunk_locked_by_staff && !opts.takeBunksFromFile) {
        warnings.push(`bunk differs in file ("${nb ?? "—"}"), kept staff assignment "${ob ?? "—"}"`);
      } else {
        changes.push({ field: "bunk", old: ob, new: nb });
      }
    }
  }

  const np = parsed.bunk_preferences.join(" | ");
  const op = (ex.bunk_preferences ?? []).join(" | ");
  if (!(np === "" && skipEmpty) && np !== op) changes.push({ field: "bunk_preferences", old: op || null, new: np || null });

  // contacts (import-sourced only)
  const exImport = ex.contacts.filter((c) => c.source === "import");
  const key = (role: string, slot: number) => `${role},${slot}`;
  const seen = new Set<string>();
  for (const c of parsed.contacts) {
    const k = key(c.role, c.slot);
    seen.add(k);
    const o = exImport.find((x) => x.role === c.role && x.slot === c.slot);
    const pairs: [string, string | null, string | null][] = [
      ["name", normText(o?.name), normText(c.name)],
      ["phone", o?.phone_e164 ?? normText(o?.phone), c.phone_e164 ?? normText(c.phone)],
      ["email", normText(o?.email)?.toLowerCase() ?? null, normText(c.email)?.toLowerCase() ?? null],
    ];
    for (const [prop, ov, nv] of pairs) {
      if (nv === null && skipEmpty) continue;
      if (nv !== ov) changes.push({ field: `contact[${k}].${prop}`, old: ov, new: nv });
    }
  }
  if (!skipEmpty) {
    for (const o of exImport) {
      const k = key(o.role, o.slot);
      if (!seen.has(k)) changes.push({ field: `contact[${k}]`, old: o.name ?? o.phone ?? o.email ?? "(contact)", new: null });
    }
  }
  return { changes, warnings };
}

export function matchAndDiff(
  rows: { rowNumber: number; parsed: ParsedCamper }[],
  existing: ExistingCamper[],
  known: { name: string; bunks: string[] }[],
  opts: DiffOptions,
): { rows: RowResult[]; summary: DiffSummary } {
  const bySource = new Map<string, ExistingCamper>();
  const byName = new Map<string, ExistingCamper[]>();
  for (const e of existing) {
    if (e.source_id) bySource.set(e.source_id, e);
    const k = normalizeName(`${e.first_name} ${e.last_name}`);
    byName.set(k, [...(byName.get(k) ?? []), e]);
  }
  const seenSource = new Set<string>();
  const matchedIds = new Set<string>();
  const results: RowResult[] = [];

  for (const { rowNumber, parsed } of rows) {
    const warnings = [...parsed.warnings];
    const cand = (e: ExistingCamper): Candidate => ({ id: e.id, display_name: `${e.first_name} ${e.last_name}`, division_name: e.division_name });

    if (!parsed.first_name && !parsed.last_name) {
      results.push({ rowNumber, parsed, matchedCamperId: null, matchMethod: null, action: "skip", changes: [], warnings: [...warnings, "skipped: no name"] });
      continue;
    }
    if (parsed.source_id && seenSource.has(parsed.source_id)) {
      results.push({ rowNumber, parsed, matchedCamperId: null, matchMethod: null, action: "conflict", changes: [], warnings: [...warnings, `duplicate id ${parsed.source_id} in file`] });
      continue;
    }
    if (parsed.source_id) seenSource.add(parsed.source_id);

    let match: ExistingCamper | undefined;
    let method: RowResult["matchMethod"] = null;
    if (parsed.source_id && bySource.has(parsed.source_id)) {
      match = bySource.get(parsed.source_id)!;
      method = "source_id";
    } else {
      const nk = normalizeName(`${parsed.first_name} ${parsed.last_name}`);
      const sameName = (byName.get(nk) ?? []).filter((e) => !matchedIds.has(e.id));
      const sameDiv = sameName.filter((e) => normText(e.division_name) === normText(parsed.division_name) || !parsed.division_name);
      if (!parsed.source_id || sameName.some((e) => !e.source_id)) {
        if (sameDiv.length === 1) {
          match = sameDiv[0];
          method = "name";
        } else if (sameDiv.length > 1) {
          results.push({ rowNumber, parsed, matchedCamperId: null, matchMethod: null, action: "conflict", changes: [], warnings: [...warnings, "several existing campers have this name"], candidates: sameDiv.map(cand) });
          continue;
        }
      }
      if (!match && sameName.length > 0) warnings.push(`same name already exists in ${sameName.map((e) => e.division_name ?? "unknown division").join(", ")}`);
    }

    if (match) {
      matchedIds.add(match.id);
      const d = diffOne(parsed, match, opts);
      results.push({
        rowNumber,
        parsed,
        matchedCamperId: match.id,
        matchMethod: method,
        action: d.changes.length ? "update" : "unchanged",
        changes: d.changes,
        warnings: [...warnings, ...d.warnings],
      });
    } else {
      results.push({ rowNumber, parsed, matchedCamperId: null, matchMethod: null, action: "add", changes: [], warnings });
    }
  }

  const divisionsInFile = [...new Set(rows.map((r) => normText(r.parsed.division_name)).filter((x): x is string => x !== null))];
  const knownDivs = new Set(known.map((k) => k.name));
  const newDivisions = divisionsInFile.filter((d) => !knownDivs.has(d));
  const newBunks = [
    ...new Set(
      rows
        .filter((r) => r.parsed.division_name && r.parsed.bunk_name)
        .filter((r) => !(known.find((k) => k.name === normText(r.parsed.division_name))?.bunks ?? []).includes(normText(r.parsed.bunk_name)!))
        .map((r) => `${normText(r.parsed.division_name)} / ${normText(r.parsed.bunk_name)}`),
    ),
  ];
  const missing = existing
    .filter((e) => e.division_name && divisionsInFile.includes(e.division_name) && !matchedIds.has(e.id))
    .map((e) => ({ id: e.id, display_name: `${e.first_name} ${e.last_name}`, division_name: e.division_name }));

  const count = (a: RowAction) => results.filter((r) => r.action === a).length;
  return {
    rows: results,
    summary: {
      added: count("add"),
      updated: count("update"),
      unchanged: count("unchanged"),
      conflicts: count("conflict"),
      skipped: count("skip"),
      missing,
      divisionsInFile,
      newDivisions,
      newBunks,
    },
  };
}
