import type { ColumnMap, MappingOptions } from "./mapping";

/** Mirrors the seeded `import_mappings` row for the registration export. */
export const DEFAULT_COLUMN_MAP: ColumnMap = {
  "students.id": "source_id",
  "students.first_name": "first_name",
  "students.last_name": "last_name",
  "group_types.division": "division",
  "group_types.hebrew_bunks": "bunk",
  "group_types.french_bunks": "bunk",
  "group_types.bunks": "bunk",
  "ppa.grade": "grade",
  "ppa.t-shirt_size": "tshirt_size",
  "ppa.bunk_preference_1": "bunk_preferences[0]",
  "ppa.bunk_preference_2": "bunk_preferences[1]",
  "ppa.bunk_preference_3": "bunk_preferences[2]",
  "ppa.crown_heights_address": "local_address",
  "ppa.crown_heights_address_cross_streets": "local_address_cross_streets",
  "ppa.medical_considerations": "medical_notes",
  "ppa.allergies": "allergies",
  "ppa.allergies_yes_or_no": "has_allergies",
  "ppa.epipen_yes_no": "has_epipen",
  "ppa.medications_yes_no": "has_medications",
  "ppa.anything_else_we_should_know": "notes_from_parents",
  "mother.first_name": "contact[mother].name",
  "mother.phone": "contact[mother].phone",
  "father.first_name": "contact[father].first_name",
  "father.last_name": "contact[father].last_name",
  "father.phone": "contact[father].phone",
  "father.email": "contact[father].email",
  "ppa.emergency_contact_1": "contact[emergency,1].name",
  "ppa.phone_number_for_emergency_contact_1": "contact[emergency,1].phone",
  "ppa.emergency_contact_2": "contact[emergency,2].name",
  "ppa.emergency_contact_number": "contact[emergency,2].phone",
};

export const DEFAULT_MAPPING_OPTIONS: MappingOptions = {
  bunkColumnPriority: ["group_types.hebrew_bunks", "group_types.french_bunks", "group_types.bunks"],
  booleanYes: ["yes", "y", "true", "oui", "כן"],
  booleanNo: ["no", "n", "false", "non", "לא"],
  phoneDefaultRegion: "US",
  emptyMeansUnknown: true,
};

/**
 * A Kinus field for a column of an export Kinus hasn't seen ("First Name", "Student ID"…),
 * so a new kind of export (a separate program's) starts mostly matched. Null: no guess.
 */
export function guessTarget(header: string): string | null {
  const h = header.toLowerCase().replace(/[#._-]+/g, " ").replace(/\s+/g, " ").trim();
  const rules: [RegExp, string][] = [
    [/^(student |camper |child |participant )?first ?name$|^first$|^given name$/, "first_name"],
    [/^(student |camper |child |participant )?last ?name$|^last$|^surname$|^family name$/, "last_name"],
    [/^(student |camper |participant |registration |reg )?id$|^(student|camper|registration|participant) (id|number|no)$/, "source_id"],
    [/^grade( level)?$/, "grade"],
    [/^(t ?shirt|tshirt|shirt)( size)?$/, "tshirt_size"],
    [/^division$/, "division"],
    [/^(bunk|cabin|group)$/, "bunk"],
    [/^allergies$/, "allergies"],
    [/^(medical|medical notes|medical considerations)$/, "medical_notes"],
  ];
  return rules.find(([re]) => re.test(h))?.[1] ?? null;
}
