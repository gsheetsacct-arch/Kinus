/** Plain-language names and explanations for everything a new user sees. */
import type { AccessLevel, GlobalRole, ScopeRole } from "@/lib/auth/permissions";

export const GLOBAL_ROLES: Record<GlobalRole, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Everything, including managing other admins." },
  admin: { label: "Admin", description: "Everything: imports, staff, divisions, settings." },
  director: { label: "Director", description: "Sees and edits every camper. Can give staff access." },
  logistics: { label: "Logistics", description: "Sees every camper and can check them in and out." },
  office: { label: "Office", description: "Sees every camper and their contacts, and handles printing." },
  staff: { label: "Staff", description: "Only sees the divisions or bunks you assign them." },
};

export const SCOPE_ROLES: Record<ScopeRole, { label: string; description: string }> = {
  division_head: { label: "Division head", description: "Runs the division. Gets the most detailed lists." },
  head_counselor: { label: "Head counselor", description: "Oversees counselors. Sees medical details." },
  counselor: { label: "Counselor", description: "Looks after a bunk. Gets the bunk list." },
  scanner: { label: "Check-in helper", description: "Only helps check campers in and out." },
};

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

export function scopeSummary(s: { division_name: string; bunk_name: string | null; scope_role: ScopeRole; access_level: AccessLevel }) {
  return `${s.division_name} · ${s.bunk_name ?? "all bunks"} · ${SCOPE_ROLES[s.scope_role].label} · ${ACCESS_LEVELS[s.access_level].label}`;
}
