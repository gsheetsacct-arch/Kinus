import { formatPhone } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { FIELD_BY_KEY, UNGATED_GROUPS, getFieldValue } from "@/lib/fields";
import { presetAudiencesFor, visibleFieldGroups, type CurrentUser, type FieldVisibilityRow } from "@/lib/auth/permissions";
import { listCampers } from "./campers";
import { STATUS_LABEL } from "@/lib/attendance/machine";
import { CAMPER_FLAGS, parseFlags, type CamperFlag } from "@/lib/camper-flags";
import { SLEEPING_COLUMN, SLEEPING_COLUMN_LABEL, sleepingText } from "@/lib/sleeping";

type DB = SupabaseClient<Database>;

export type ListPreset = { id: string; name: string; audience: string; columns: string[]; sort: { field: string; dir: string }[]; group_by: string | null; is_default: boolean; /** Only campers with these (lib/camper-flags): any one of them, or all of them. */ only: CamperFlag[]; match: "any" | "all"; /** Only campers whose export column is one of these values ("(empty)": nothing in it). */ where: ColumnFilter[] };

export type ColumnFilter = { column: string; values: string[] };

/** The layout's column filters, as saved ({ where: [{ column, values }] }). */
export function parseWhere(filters: unknown): ColumnFilter[] {
  const w = (filters as { where?: unknown } | null)?.where;
  if (!Array.isArray(w)) return [];
  return w
    .filter((x): x is ColumnFilter => Boolean(x && typeof x.column === "string" && Array.isArray(x.values)))
    .map((x) => ({ column: x.column, values: x.values.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean) }))
    .filter((x) => x.column && x.values.length)
    .slice(0, 5);
}

export type BuiltList = {
  preset: ListPreset;
  columns: { key: string; label: string }[];
  /** staff: a bunk's counselors with their phones ("Moshe Katz 718-555-0100"), for head staff. */
  groups: { title: string; rows: { id: string; cells: (string | boolean | null)[] }[]; staff?: string[] }[];
  scopeLabel: string;
};

export async function getPresetsFor(supabase: DB, user: CurrentUser): Promise<ListPreset[]> {
  const audiences = presetAudiencesFor(user);
  const { data } = await supabase.from("list_presets").select("id, name, audience, columns, sort, group_by, is_default, filters").in("audience", audiences).order("audience").order("name");
  return (data ?? []).map(({ filters, ...p }) => ({
    ...p,
    columns: p.columns as string[],
    sort: p.sort as { field: string; dir: string }[],
    only: parseFlags(((filters as { only?: string[] } | null)?.only ?? []).join(",")),
    match: (filters as { match?: string } | null)?.match === "all" ? ("all" as const) : ("any" as const),
    where: parseWhere(filters),
  }));
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
  scope: { sessionId: string; divisionId?: string; bunkId?: string; divisionIds?: string[] | null; campName?: string; /** Also only these, chosen on the page. */ only?: CamperFlag[]; /** Each bunk's counselors (and phones) under its title: a switch on the page, off by default. */ counselors?: boolean },
  fv: FieldVisibilityRow[],
): Promise<BuiltList> {
  // sensitive columns only appear for roles allowed to see them (the data is masked anyway)
  const groupsAnywhere = visibleFieldGroups(user, fv);
  const sortKeys = preset.sort.length ? preset.sort : [{ field: "last_name", dir: "asc" }];
  // extra fields from the registration export ("source.ppa.sleeping_at_the_kinus")
  const extraAll = (preset.where ?? []).length
    ? await import("./extra-fields").then(async (m) => (await m.loadExtraFields()).map((f) => ({ key: `source.${f.column}`, group: m.extraGroupOf(f) })))
    : [];
  const extraDefs = preset.columns.some((k) => k.startsWith("source."))
    ? await import("./extra-fields").then(async (m) => (await m.loadExtraFields()).map((f) => ({ key: `source.${f.column}`, label: f.label, group: m.extraGroupOf(f), kind: "text" as const, answers: f.answers })))
    : [];
  const defOf = (k: string) => FIELD_BY_KEY[k] ?? extraDefs.find((f) => f.key === k) ?? (k === SLEEPING_COLUMN ? { key: k, label: SLEEPING_COLUMN_LABEL, group: "basic" as const, kind: "text" as const } : undefined);
  const shownColumns = preset.columns
    .map(defOf)
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .filter((f) => UNGATED_GROUPS.includes(f.group) || groupsAnywhere.has(f.group));
  const fields = [...new Set([...shownColumns.map((f) => f.key), ...sortKeys.map((s) => s.field), ...(preset.group_by ? [preset.group_by] : [])])].filter((k) => FIELD_BY_KEY[k]);
  // the layout's filters: all of them, or (by default) any one of them; the page's choice narrows it further
  const anyOf = preset.match === "any" && preset.only.length > 1 ? preset.only : [];
  const only = [...new Set([...(anyOf.length ? [] : preset.only), ...(scope.only ?? [])])];
  const [loaded, { data: divisions }] = await Promise.all([
    listCampers(supabase, { sessionId: scope.sessionId, divisionId: scope.divisionId, bunkId: scope.bunkId, divisionIds: scope.divisionIds, fields, only, anyOf }),
    supabase.from("divisions").select("id, name").eq("session_id", scope.sessionId),
  ]);
  // the layout's column filters ("T-shirt is M or L"): only on columns this person may see
  let campers = loaded;
  const where = (preset.where ?? []).filter((w) => {
    const def = extraDefs.find((f) => f.key === `source.${w.column}`) ?? extraAll.find((f) => f.key === `source.${w.column}`);
    return def && (UNGATED_GROUPS.includes(def.group) || groupsAnywhere.has(def.group));
  });
  if (where.length && campers.length) {
    const m = await import("./extra-fields");
    const { shortAnswer } = await import("@/lib/import/extra-fields");
    const defs = await m.loadExtraFields();
    const raw = await m.extraValuesFor(campers.map((c) => String(c.id)), where.map((w) => ({ column: w.column })));
    const norm = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase();
    campers = campers.filter((c) =>
      where.every((w) => {
        const value = raw.get(String(c.id))?.[w.column] ?? "";
        const short = shortAnswer(defs.find((f) => f.column === w.column) ?? {}, value);
        return w.values.some((want) => (want === "(empty)" ? !value.trim() : norm(want) === norm(value) || norm(want) === norm(short)));
      }),
    );
  }
  const columnLabels = new Map(where.length ? (await import("./extra-fields").then((m) => m.loadExtraFields())).map((f) => [f.column, f.label] as const) : []);
  const columns = shownColumns.map((f) => ({ key: f.key, label: f.label }));
  const extraCols = columns.filter((c) => c.key.startsWith("source.")).map((c) => ({ column: c.key.slice(7), label: c.label, answers: extraDefs.find((f) => f.key === c.key)?.answers }));
  // "Sleeping here" / "Going home", from the registration's Sleeping At The Kinus
  const sleeping = columns.some((c) => c.key === SLEEPING_COLUMN) ? await import("./sleeping").then((m) => m.sleepingAtKinus(scope.sessionId, campers.map((c) => String(c.id)))) : null;
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
        if (col.key === SLEEPING_COLUMN) return sleepingText(sleeping?.get(String(c.id)));
        const v = getFieldValue(c, col.key);
        if (col.key === "status" && typeof v === "string") return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v;
        if (col.key.endsWith(".phone") && typeof v === "string") return formatPhone(v);
        return v;
      }),
    });
  }
  // each bunk's counselors, with their numbers (most counselors don't sign in; they're listed), when asked for
  if (scope.counselors && bunkOfGroup.size) {
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
    scopeLabel: [[divName, bunkName].filter(Boolean).join(" · ") || (scope.campName ? `All of ${scope.campName}` : "All divisions"), ...(anyOf.length ? [anyOf.map((k) => CAMPER_FLAGS[k].label).join(" or ")] : []), ...only.map((k) => CAMPER_FLAGS[k].label), ...where.map((w) => `${columnLabels.get(w.column) ?? w.column}: ${w.values.join(" or ")}`)].join(" · "),
  };
}
