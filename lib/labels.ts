/** Plain-language names and explanations for everything a new user sees. */
import type { AccessLevel, StaffRole } from "@/lib/auth/permissions";

export const STAFF_ROLES: Record<StaffRole, { label: string; description: string; defaultLevel: AccessLevel; audience: string }> = {
  owner: { label: "Owner", description: "Everything, everywhere, including other owners.", defaultLevel: "edit", audience: "director" },
  director: { label: "Director", description: "Runs camp, or part of it: campers, staff and corrections. Over all of camp they also handle imports and settings.", defaultLevel: "edit", audience: "director" },
  division_head: { label: "Division head", description: "Runs a division. Gets the most detailed lists.", defaultLevel: "edit", audience: "division_head" },
  head_counselor: { label: "Head counselor", description: "Oversees counselors. Sees medical details.", defaultLevel: "scan", audience: "head_counselor" },
  counselor: { label: "Counselor", description: "Looks after a bunk. Gets the bunk list.", defaultLevel: "scan", audience: "counselor" },
  scanner: { label: "Check-in helper", description: "Only helps check campers in and out.", defaultLevel: "scan", audience: "counselor" },
  office: { label: "Office", description: "Sees campers and contacts, and handles printing.", defaultLevel: "view", audience: "office" },
  logistics: { label: "Logistics", description: "Checks campers in and out, buses and pickup.", defaultLevel: "scan", audience: "office" },
};
export const ROLE_ORDER: StaffRole[] = ["director", "division_head", "head_counselor", "counselor", "scanner", "office", "logistics", "owner"];

export const ACCESS_LEVELS: Record<AccessLevel, { label: string; description: string }> = {
  view: { label: "View only", description: "See campers, where they are, and contacts." },
  scan: { label: "Check in & out", description: "View, plus check campers in and out and request tags." },
  edit: { label: "Edit details", description: "All of the above, plus change camper details and bunks." },
};

export const FIELD_GROUPS: Record<string, { label: string; description: string }> = {
  contacts: { label: "Parent & emergency contacts", description: "Names, phone numbers and emails" },
  medical: { label: "Medical details", description: "Allergies, EpiPen, medications, medical notes" },
  parent_notes: { label: "Notes from parents", description: "The “anything else we should know” answer" },
  address: { label: "Local address", description: "Where the camper stays, with cross streets" },
  staff_notes: { label: "Staff notes", description: "Notes staff wrote in Kinus" },
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
