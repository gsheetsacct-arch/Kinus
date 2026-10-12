import { formatPhone } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { FIELD_BY_KEY, UNGATED_GROUPS, getFieldValue, groupOfKey } from "@/lib/fields";
import { presetAudiencesFor, visibleFieldGroups, type CurrentUser, type FieldVisibilityRow } from "@/lib/auth/permissions";
import { listCampers } from "./campers";
import { STATUS_LABEL } from "@/lib/attendance/machine";

type DB = SupabaseClient<Database>;

export type ListPreset = { id: string; name: string; audience: string; columns: string[]; sort: { field: string; dir: string }[]; group_by: string | null; is_default: boolean };

export type BuiltList = {
  preset: ListPreset;
  columns: { key: string; label: string }[];
  /** staff: a bunk's counselors with their phones ("Moshe Katz 718-555-0100"), for head staff. */
  groups: { title: string; rows: { id: string; cells: (string | boolean | null)[] }[]; staff?: string[] }[];
  scopeLabel: string;
};

export async function getPresetsFor(supabase: DB, user: CurrentUser): Promise<ListPreset[]> {
  const audiences = presetAudiencesFor(user);
  const { data } = await supabase.from("list_presets").select("id, name, audience, columns, sort, group_by, is_default").in("audience", audiences).order("audience").order("name");
  return (data ?? []).map((p) => ({ ...p, columns: p.columns as string[], sort: p.sort as { field: string; dir: string }[] }));
}

/** Bunk and division groups in the camp's own order (the same as Who's here), not A–Z. */
async function inCampOrder<G extends { title: string }>(supabase: DB, sessionId: string, groupBy: string | null, groups: G[]): Promise<G[]> {
  if (groupBy !== "bunk" && groupBy !== "division") return groups;
  const { data: divs } = await supabase.from("divisions").select("name, sort_order, bunks(name, sort_order)").eq("session_id", sessionId);
  const rank = new Map<string, number>();
  for (const d of divs ?? []) {
    if (groupBy === "division") rank.set(d.name, d.sort_order);
    else for (const b of (d.bunks as { name: string; sort_order: number }[]) ?? []) if (!rank.has(b.name)) rank.set(b.name, d.sort_order * 10000 + b.sort_order);
  }
  return [...groups].sort((a, b) => (rank.get(a.title) ?? 1e9) - (rank.get(b.title) ?? 1e9) || a.title.localeCompare(b.title, undefined, { numeric: true }));
}

const cmp = (a: string | boolean | null, b: string | boolean | null) => String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });

/** Builds a list: scope-filtered campers, visible columns only, grouped and sorted per preset. */
export async function buildList(
  supabase: DB,
  user: CurrentUser,
  preset: ListPreset,
  scope: { sessionId: string; divisionId?: string; bunkId?: string; divisionIds?: string[] | null; campName?: string },
  fv: FieldVisibilityRow[],
): Promise<BuiltList> {
  // sensitive columns only appear for roles allowed to see them (the data is masked anyway)
  const groupsAnywhere = visibleFieldGroups(user, fv);
  const sortKeys = preset.sort.length ? preset.sort : [{ field: "last_name", dir: "asc" }];
  // extra fields from the registration export ("source.ppa.sleeping_at_the_kinus")
  const extraDefs = preset.columns.some((k) => k.startsWith("source."))
    ? await import("./extra-fields").then(async (m) => (await m.loadExtraFields()).map((f) => ({ key: `source.${f.column}`, label: f.label, group: groupOfKey(`source.${f.column}`), kind: "text" as const })))
    : [];
  const defOf = (k: string) => FIELD_BY_KEY[k] ?? extraDefs.find((f) => f.key === k);
  const shownColumns = preset.columns
    .map(defOf)
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .filter((f) => UNGATED_GROUPS.includes(f.group) || groupsAnywhere.has(f.group));
  const fields = [...new Set([...shownColumns.map((f) => f.key), ...sortKeys.map((s) => s.field), ...(preset.group_by ? [preset.group_by] : [])])].filter((k) => FIELD_BY_KEY[k]);
  const [campers, { data: divisions }] = await Promise.all([
    listCampers(supabase, { sessionId: scope.sessionId, divisionId: scope.divisionId, bunkId: scope.bunkId, divisionIds: scope.divisionIds, fields }),
    supabase.from("divisions").select("id, name").eq("session_id", scope.sessionId),
  ]);
  const columns = shownColumns.map((f) => ({ key: f.key, label: f.label }));
  const extraCols = columns.filter((c) => c.key.startsWith("source.")).map((c) => ({ column: c.key.slice(7), label: c.label }));
  const extraValues = extraCols.length ? await import("./extra-fields").then((m) => m.extraValuesFor(campers.map((c) => String(c.id)), extraCols)) : new Map<string, Record<string, string>>();

  const sorted = [...campers].sort((a, b) => {
    for (const s of sortKeys) {
      const r = cmp(getFieldValue(a, s.field), getFieldValue(b, s.field));
      if (r !== 0) return s.dir === "desc" ? -r : r;
    }
    return 0;
  });
  const groupKey = preset.group_by;
  const groupsMap = new Map<string, BuiltList["groups"][number]>();
  const bunkOfGroup = new Map<string, string>();
  for (const c of sorted) {
    const title = groupKey ? String(getFieldValue(c, groupKey) ?? (groupKey === "bunk" ? "Unassigned" : "—")) : "";
    if (groupKey === "bunk" && c.bunk_id && !bunkOfGroup.has(title)) bunkOfGroup.set(title, String(c.bunk_id));
    if (!groupsMap.has(title)) groupsMap.set(title, { title, rows: [] });
    groupsMap.get(title)!.rows.push({
      id: c.id!,
      cells: columns.map((col) => {
        if (col.key.startsWith("source.")) return extraValues.get(String(c.id))?.[col.key.slice(7)] || null;
        const v = getFieldValue(c, col.key);
        if (col.key === "status" && typeof v === "string") return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v;
        if (col.key.endsWith(".phone") && typeof v === "string") return formatPhone(v);
        return v;
      }),
    });
  }
  // each bunk's counselors, with their numbers (most counselors don't sign in; they're listed)
  if (bunkOfGroup.size) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data: staff } = await createAdminClient()
      .from("staff_scopes")
      .select("bunk_id, profiles!staff_scopes_user_id_fkey!inner(full_name, phone, role, is_active)")
      .in("bunk_id", [...new Set(bunkOfGroup.values())])
      .eq("profiles.role", "counselor")
      .eq("profiles.is_active", true);
    for (const [title, bunkId] of bunkOfGroup) {
      const names = (staff ?? [])
        .filter((x) => x.bunk_id === bunkId)
        .map((x) => x.profiles as unknown as { full_name: string; phone: string | null })
        .map((p) => (p.phone ? `${p.full_name} ${formatPhone(p.phone)}` : p.full_name));
      if (names.length) groupsMap.get(title)!.staff = names;
    }
  }
  const divName = scope.divisionId ? (divisions ?? []).find((d) => d.id === scope.divisionId)?.name : null;
  let bunkName: string | null = null;
  if (scope.bunkId) bunkName = (await supabase.from("bunks").select("name").eq("id", scope.bunkId).maybeSingle()).data?.name ?? null;
  return {
    preset,
    columns,
    groups: await inCampOrder(supabase, scope.sessionId, groupKey, [...groupsMap.values()]),
    scopeLabel: [divName, bunkName].filter(Boolean).join(" · ") || (scope.campName ? `All of ${scope.campName}` : "All divisions"),
  };
}
