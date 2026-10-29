/**
 * The "only campers who…" filters, the same on every page (Campers, Lists, list layouts):
 * a medical flag, an EpiPen, notes, coming later, no bunk yet. What a person can't see
 * (medical details, notes) is masked for them, so it never matches for them either; the
 * filters they can't use aren't offered.
 */
import type { FieldGroup } from "@/lib/fields";

export const CAMPER_FLAGS = {
  medical: { label: "Medical flag", badge: "medical", needs: null },
  epipen: { label: "EpiPen", badge: "EpiPen", needs: "medical" },
  notes: { label: "Has notes", badge: "notes", needs: "notes" },
  later: { label: "Coming later", badge: "coming later", needs: null },
  no_bunk: { label: "No bunk yet", badge: "no bunk", needs: null },
} as const satisfies Record<string, { label: string; badge: string; needs: FieldGroup | "notes" | null }>;
export type CamperFlag = keyof typeof CAMPER_FLAGS;
export const FLAG_KEYS = Object.keys(CAMPER_FLAGS) as CamperFlag[];
export const isFlag = (k: string): k is CamperFlag => k in CAMPER_FLAGS;

/** The filters someone who sees these field groups can use. */
export function flagsFor(groups: Set<string>): CamperFlag[] {
  return FLAG_KEYS.filter((k) => {
    const needs = CAMPER_FLAGS[k].needs as string | null;
    if (!needs) return true;
    if (needs === "notes") return groups.has("parent_notes") || groups.has("staff_notes");
    return groups.has(needs);
  });
}

const filled = (v: unknown) => typeof v === "string" && v.trim() !== "";

export type FlagSource = {
  has_medical_flag?: boolean | null;
  has_epipen?: boolean | null;
  medical_notes?: string | null;
  allergies?: string | null;
  notes_from_parents?: string | null;
  staff_notes?: string | null;
  bunk_id?: string | null;
  status?: string | null;
};

/** Which flags a camper has. `later`: they have a "coming later" follow-up (Missing). */
export function camperFlags(c: FlagSource, later: boolean): Set<CamperFlag> {
  const out = new Set<CamperFlag>();
  if (c.has_medical_flag || c.has_epipen || filled(c.medical_notes) || filled(c.allergies)) out.add("medical");
  if (c.has_epipen) out.add("epipen");
  if (filled(c.notes_from_parents) || filled(c.staff_notes)) out.add("notes");
  if (later && c.status === "expected") out.add("later");
  if (!c.bunk_id) out.add("no_bunk");
  return out;
}

/** The view columns the flags are read from. */
export const FLAG_COLUMNS = ["has_medical_flag", "has_epipen", "medical_notes", "allergies", "notes_from_parents", "staff_notes", "bunk_id", "status"];

/** "medical,later" from the address bar → the known flags. */
export const parseFlags = (v: string | null | undefined): CamperFlag[] => [...new Set((v ?? "").split(",").map((s) => s.trim()).filter(isFlag))];
