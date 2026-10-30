/** Plain-language names and explanations for everything a new user sees. */
import type { AccessLevel, StaffRole } from "@/lib/auth/permissions";

export const STAFF_ROLES: Record<StaffRole, { label: string; description: string; defaultLevel: AccessLevel; audience: string }> = {
  owner: { label: "Owner", description: "Everything, everywhere, including other owners.", defaultLevel: "edit", audience: "director" },
  director: { label: "Director", description: "Runs camp, or part of it.", defaultLevel: "edit", audience: "director" },
  division_head: { label: "Division head", description: "Runs a division.", defaultLevel: "edit", audience: "division_head" },
  kloli: { label: "Kloli", description: "Oversees the head counselors and counselors of a division.", defaultLevel: "scan", audience: "head_counselor" },
  head_counselor: { label: "Head counselor", description: "Oversees the counselors of a division.", defaultLevel: "scan", audience: "head_counselor" },
  counselor: { label: "Counselor", description: "Looks after a bunk.", defaultLevel: "scan", audience: "counselor" },
  scanner: { label: "Check-in helper", description: "Helps check campers in and out at the gate.", defaultLevel: "scan", audience: "counselor" },
  office: { label: "Office", description: "Works in the camp office.", defaultLevel: "view", audience: "office" },
  staff: { label: "Staff", description: "On the staff list, with no particular role.", defaultLevel: "view", audience: "counselor" },
  logistics: { label: "Logistics", description: "Buses, pickup and drop-off.", defaultLevel: "scan", audience: "office" },
};
export const ROLE_ORDER: StaffRole[] = ["director", "division_head", "kloli", "head_counselor", "counselor", "scanner", "office", "logistics", "staff", "owner"];

export const ACCESS_LEVELS: Record<AccessLevel, { label: string; description: string }> = {
  view: { label: "View only", description: "See campers and where they are." },
  scan: { label: "Check in & out", description: "View, plus check campers in and out and request tags." },
  edit: { label: "Edit details", description: "All of the above, plus change camper details and bunks, and add walk-ins." },
};

export const FIELD_GROUPS: Record<string, { label: string; short: string; description: string }> = {
  contacts: { label: "Parent & emergency contacts", short: "contacts", description: "Names, phone numbers and emails" },
  medical: { label: "Medical details", short: "medical", description: "Allergies, EpiPen, medications, medical notes" },
  parent_notes: { label: "Notes from parents", short: "notes from parents", description: "The “anything else we should know” answer" },
  address: { label: "Local address", short: "address", description: "Where the camper stays, with cross streets" },
  staff_notes: { label: "Staff notes", short: "staff notes", description: "Notes staff wrote in Kinus" },
};

/** What a role can do besides its level and details: fixed, shown on the Roles page. */
export const ROLE_EXTRAS: Record<StaffRole, string[]> = {
  owner: ["Everything, including other owners"],
  director: ["Manages staff in their area", "Prints and runs batches", "Over all of camp: imports, templates and settings"],
  division_head: ["Manages head counselors, counselors and check-in helpers in their divisions", "Prints and runs batches", "Follows up on campers who haven't arrived"],
  kloli: ["Manages head counselors, counselors and check-in helpers in their divisions", "Follows up on campers who haven't arrived"],
  head_counselor: ["Manages counselors and check-in helpers in their divisions", "Follows up on campers who haven't arrived"],
  counselor: ["Phone book: their head counselor and division head"],
  scanner: ["Phone book: their head counselor and division head"],
  office: ["Prints and runs batches", "Follows up on campers who haven't arrived"],
  logistics: ["Prints and runs batches (bus tags)", "Follows up on campers who haven't arrived"],
  staff: ["In the phone book, lists and texts for their divisions"],
};

export const LANGUAGES: Record<string, string> = { he: "Hebrew", fr: "French", en: "English" };

export const AUDIENCES: Record<string, string> = {
  counselor: "Counselors",
  head_counselor: "Head counselors",
  division_head: "Division heads",
  director: "Directors",
  office: "Office",
  custom: "Anyone",
};

export const IMPORT_STATUS: Record<string, { label: string; variant: "outline" | "warning" | "success" | "secondary" | "destructive" }> = {
  uploaded: { label: "Draft · columns not matched yet", variant: "outline" },
  previewed: { label: "Draft · ready to review", variant: "warning" },
  applied: { label: "Applied", variant: "success" },
  reverted: { label: "Undone", variant: "secondary" },
  cancelled: { label: "Discarded", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
};

export const DIVISION_COLORS = ["#2563eb", "#0891b2", "#059669", "#65a30d", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#9333ea", "#475569"];

/** "Main camp", "Division 2", "Division 2 · Bunk Chof" */
export function areaLabel(a: { group_id: string | null; division_id: string | null; bunk_id: string | null }, names: { group: (id: string) => string; division: (id: string) => string; bunk: (id: string) => string }) {
  if (a.group_id) return names.group(a.group_id);
  if (a.bunk_id) return `${names.division(a.division_id!)} · ${names.bunk(a.bunk_id)}`;
  return names.division(a.division_id!);
}
