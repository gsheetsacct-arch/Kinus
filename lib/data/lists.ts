import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { FIELD_BY_KEY, UNGATED_GROUPS, getFieldValue } from "@/lib/fields";
import { presetAudiencesFor, visibleFieldGroups, type CurrentUser, type FieldVisibilityRow } from "@/lib/auth/permissions";
import { listCampers } from "./campers";
import { STATUS_LABEL } from "@/lib/attendance/machine";

type DB = SupabaseClient<Database>;

export type ListPreset = { id: string; name: string; audience: string; columns: string[]; sort: { field: string; dir: string }[]; group_by: string | null; is_default: boolean };

export type BuiltList = {
  preset: ListPreset;
  columns: { key: string; label: string }[];
  groups: { title: string; rows: { id: string; cells: (string | boolean | null)[] }[] }[];
  scopeLabel: string;
};

export async function getPresetsFor(supabase: DB, user: CurrentUser): Promise<ListPreset[]> {
  const audiences = presetAudiencesFor(user);
  const { data } = await supabase.from("list_presets").select("id, name, audience, columns, sort, group_by, is_default").in("audience", audiences).order("audience").order("name");
  return (data ?? []).map((p) => ({ ...p, columns: p.columns as string[], sort: p.sort as { field: string; dir: string }[] }));
}

const cmp = (a: string | boolean | null, b: string | boolean | null) => String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });

/** Builds a list: scope-filtered campers, visible columns only, grouped and sorted per preset. */
export async function buildList(
  supabase: DB,
  user: CurrentUser,
  preset: ListPreset,
  scope: { sessionId: string; divisionId?: string; bunkId?: string; divisionIds?: string[] | null },
  fv: FieldVisibilityRow[],
): Promise<BuiltList> {
  // sensitive columns only appear for roles allowed to see them (the data is masked anyway)
  const groupsAnywhere = visibleFieldGroups(user, fv);
  const sortKeys = preset.sort.length ? preset.sort : [{ field: "last_name", dir: "asc" }];
  const shownColumns = preset.columns
    .map((k) => FIELD_BY_KEY[k])
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .filter((f) => UNGATED_GROUPS.includes(f.group) || groupsAnywhere.has(f.group));
  const fields = [...new Set([...shownColumns.map((f) => f.key), ...sortKeys.map((s) => s.field), ...(preset.group_by ? [preset.group_by] : [])])].filter((k) => FIELD_BY_KEY[k]);
  const [campers, { data: divisions }] = await Promise.all([
    listCampers(supabase, { sessionId: scope.sessionId, divisionId: scope.divisionId, bunkId: scope.bunkId, divisionIds: scope.divisionIds, fields }),
    supabase.from("divisions").select("id, name").eq("session_id", scope.sessionId),
  ]);
  const columns = preset.columns
    .map((k) => FIELD_BY_KEY[k])
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .filter((f) => UNGATED_GROUPS.includes(f.group) || groupsAnywhere.has(f.group))
    .map((f) => ({ key: f.key, label: f.label }));

  const sorted = [...campers].sort((a, b) => {
    for (const s of sortKeys) {
      const r = cmp(getFieldValue(a, s.field), getFieldValue(b, s.field));
      if (r !== 0) return s.dir === "desc" ? -r : r;
    }
    return 0;
  });
  const groupKey = preset.group_by;
  const groupsMap = new Map<string, BuiltList["groups"][number]>();
  for (const c of sorted) {
    const title = groupKey ? String(getFieldValue(c, groupKey) ?? (groupKey === "bunk" ? "Unassigned" : "—")) : "";
    if (!groupsMap.has(title)) groupsMap.set(title, { title, rows: [] });
    groupsMap.get(title)!.rows.push({
      id: c.id!,
      cells: columns.map((col) => {
        const v = getFieldValue(c, col.key);
        if (col.key === "status" && typeof v === "string") return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v;
        return v;
      }),
    });
  }
  const divName = scope.divisionId ? (divisions ?? []).find((d) => d.id === scope.divisionId)?.name : null;
  let bunkName: string | null = null;
  if (scope.bunkId) bunkName = (await supabase.from("bunks").select("name").eq("id", scope.bunkId).maybeSingle()).data?.name ?? null;
  return {
    preset,
    columns,
    groups: [...groupsMap.values()],
    scopeLabel: [divName, bunkName].filter(Boolean).join(" · ") || (scope.divisionIds ? "Whole camp" : "All divisions"),
  };
}
