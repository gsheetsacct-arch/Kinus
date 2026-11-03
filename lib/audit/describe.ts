import { FIELD_BY_KEY } from "@/lib/fields";

/** What each logged table is, in words. */
export const TABLE_LABEL: Record<string, string> = {
  campers: "Camper",
  camper_contacts: "Camper contact",
  camper_followups: "Follow-up",
  buzzer_assignments: "Buzzer",
  profiles: "Staff member",
  staff_scopes: "Staff area",
  role_access: "Role",
  field_visibility: "Who sees what",
  update_signups: "Updates sign-up",
  sessions: "Session",
  division_groups: "Camp",
  divisions: "Division",
  bunks: "Bunk",
  buzzers: "Buzzers",
  settings: "Setting",
  list_presets: "List layout",
  print_templates: "Template",
  print_jobs: "Print request",
  merge_fields: "Label field",
  value_maps: "Conversion",
  value_map_entries: "Conversion entry",
  imports: "Import",
  import_mappings: "Import columns",
  head_counts: "Head count",
  head_count_marks: "Head count mark",
  text_broadcasts: "Text to staff",
  text_opt_outs: "Text opt-out",
  page_requests: "Page request",
  app: "On the site",
};

/** The filter's kinds of activity, and the tables (or site events) each covers. */
export const CATEGORIES: Record<string, { label: string; tables: string[] }> = {
  campers: { label: "Campers", tables: ["campers", "camper_contacts", "camper_followups", "buzzer_assignments"] },
  staff: { label: "Staff & roles", tables: ["profiles", "staff_scopes", "role_access", "field_visibility", "update_signups"] },
  setup: { label: "Camp setup & settings", tables: ["sessions", "division_groups", "divisions", "bunks", "buzzers", "settings", "list_presets"] },
  printing: { label: "Templates & printing", tables: ["print_templates", "print_jobs", "merge_fields", "value_maps", "value_map_entries"] },
  imports: { label: "Imports", tables: ["imports", "import_mappings"] },
  texts: { label: "Texts", tables: ["text_broadcasts", "text_opt_outs", "page_requests"] },
  counts: { label: "Head counts", tables: ["head_counts", "head_count_marks"] },
  site: { label: "Sign-ins, downloads & prints", tables: ["app"] },
};

/** Changes that say nothing to a person (kept in the log, not listed). */
const NOISE = new Set(["updated_at", "last_event_id", "name_normalized", "search_text", "content_hash"]);

const ACTION: Record<string, string> = { INSERT: "added", UPDATE: "changed", DELETE: "removed", download: "downloaded", sign_in: "signed in", print: "printed", send: "sent" };

/** "added", "changed"… */
export const actionWord = (table: string, action: string) => (table === "app" ? (ACTION[action] ?? action) : (ACTION[action] ?? action.toLowerCase()));

/** "tshirt_size" → "T-shirt size" (the field's own name where Kinus has one). */
export function fieldLabel(key: string): string {
  if (FIELD_BY_KEY[key]) return FIELD_BY_KEY[key].label;
  if (key === "source_data") return "Registration data (export row)";
  if (key === "source_fixes") return "Corrected registration details";
  if (key === "staff_edited") return "Fields staff edited";
  const words = key.replace(/_id$/, "").replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

/** A value as words: "—" for nothing, Yes/No, and long ones cut short. */
export function showValue(v: unknown, max = 160): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

type Row = { table_name: string; action: string; before: unknown; after: unknown; diff: unknown; row_key: string | null };

/** The fields a change touched, old → new (for an update), or what the added or removed row held. */
export function changesOf(r: Row): { field: string; label: string; old?: unknown; new?: unknown }[] {
  if (r.table_name === "app") {
    const d = (r.after ?? {}) as Record<string, unknown>;
    return Object.entries(d)
      .filter(([k, v]) => k !== "what" && v !== undefined && v !== null)
      .map(([k, v]) => ({ field: k, label: fieldLabel(k), new: v }));
  }
  if (r.action === "UPDATE") {
    const d = (r.diff ?? {}) as Record<string, { old: unknown; new: unknown }>;
    return Object.entries(d)
      .filter(([k]) => !NOISE.has(k))
      .flatMap(([k, v]) => {
        // the export row: just the columns that changed
        const o = v?.old, n = v?.new;
        if ((k === "source_data" || k === "source_fixes") && o && n && typeof o === "object" && typeof n === "object") {
          const a = o as Record<string, unknown>, b = n as Record<string, unknown>;
          return [...new Set([...Object.keys(a), ...Object.keys(b)])]
            .filter((c) => JSON.stringify(a[c]) !== JSON.stringify(b[c]))
            .map((c) => ({ field: `${k}.${c}`, label: `${k === "source_fixes" ? "Corrected" : "Registration"}: ${c}`, old: a[c], new: b[c] }));
        }
        return [{ field: k, label: fieldLabel(k), old: o, new: n }];
      });
  }
  const row = ((r.action === "DELETE" ? r.before : r.after) ?? {}) as Record<string, unknown>;
  return Object.entries(row)
    .filter(([k, v]) => !NOISE.has(k) && k !== "id" && !k.endsWith("_at") && v !== null && v !== "" && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && v && !Array.isArray(v) && !Object.keys(v).length))
    .map(([k, v]) => (r.action === "DELETE" ? { field: k, label: fieldLabel(k), old: v } : { field: k, label: fieldLabel(k), new: v }));
}

/** What the row is called: a name, a label, a key (campers are named from their record). */
export function thingName(r: Row): string | null {
  if (r.table_name === "app") return String(((r.after ?? {}) as Record<string, unknown>).what ?? "");
  const v = ((r.after ?? r.before ?? {}) as Record<string, unknown>) || {};
  const first = v.first_name && v.last_name ? `${v.first_name} ${v.last_name}` : null;
  const named = first ?? v.full_name ?? v.name ?? v.label ?? v.title ?? v.note ?? r.row_key;
  return named === null || named === undefined ? null : String(named);
}
