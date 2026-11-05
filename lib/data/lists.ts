import { formatPhone } from "@/lib/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { FIELD_BY_KEY, UNGATED_GROUPS, getFieldValue, type FieldGroup } from "@/lib/fields";
import { presetAudiencesFor, visibleFieldGroups, type CurrentUser, type FieldVisibilityRow } from "@/lib/auth/permissions";
import { listCampers } from "./campers";
import { STATUS_LABEL } from "@/lib/attendance/machine";
import { CAMPER_FLAGS, parseFlags, type CamperFlag } from "@/lib/camper-flags";
import { SLEEPING_COLUMN, SLEEPING_COLUMN_LABEL, sleepingText } from "@/lib/sleeping";

type DB = SupabaseClient<Database>;

export type ListPreset = { id: string; name: string; audience: string; columns: string[]; sort: { field: string; dir: string }[]; group_by: string | null; is_default: boolean; /** Only campers with these (lib/camper-flags): any one of them, or all of them. */ only: CamperFlag[]; match: "any" | "all"; /** Only campers whose field is one of these answers (WHERE_EMPTY: nothing in it; WHERE_ANY: anything). Every filter must match. */ where: ColumnFilter[]; /** Combined columns ("combo:<id>" in columns). */ combos?: Combo[]; /** How many copies of each group (each bunk…) print, one after another. */ copies?: number };

export { WHERE_ANY, WHERE_EMPTY, parseWhere, type ColumnFilter } from "@/lib/list-where";
import { WHERE_ANY, WHERE_EMPTY, hasContent, parseWhere, type ColumnFilter } from "@/lib/list-where";


/**
 * A combined column: several fields in one cell ("M · Sleeping here · 6¾"), to save room on a
 * printed list. In the layout's columns as "combo:<id>"; empty values are left out.
 */
export type Combo = { id: string; label: string; parts: string[]; sep: "dot" | "comma" | "slash" | "line"; labels: boolean };
export const COMBO_SEPS: Record<Combo["sep"], { label: string; text: string }> = {
  dot: { label: "·  (dot)", text: " · " },
  comma: { label: ",  (comma)", text: ", " },
  slash: { label: "/  (slash)", text: " / " },
  line: { label: "One per line", text: "\n" },
};

/** The layout's combined columns, as saved ({ combos: [...] }). */
export function parseCombos(filters: unknown): Combo[] {
  const c = (filters as { combos?: unknown } | null)?.combos;
  if (!Array.isArray(c)) return [];
  return c
    .filter((x): x is Combo => Boolean(x && typeof x.id === "string" && typeof x.label === "string" && Array.isArray(x.parts)))
    .map((x) => ({ id: x.id, label: x.label, parts: x.parts.filter((p): p is string => typeof p === "string"), sep: x.sep in COMBO_SEPS ? x.sep : "dot", labels: Boolean(x.labels) }))
    .filter((x) => x.parts.length)
    .slice(0, 12);
}



export type BuiltList = {
  preset: ListPreset;
  columns: { key: string; label: string }[];
  /** staff: a bunk's counselors with their phones ("Moshe Katz 718-555-0100"), for head staff. */
  groups: { title: string; rows: { id: string; cells: (string | boolean | null)[] }[]; staff?: string[] }[];
  scopeLabel: string;
  /** What the page can filter by: the list's columns (a combined column whole, or a field in it). */
  filterOptions: { key: string; label: string }[];
  /** The answers of the (first) column filtered by, with how many campers have each (before filtering). */
  filterValues: { value: string; count: number }[];
  /** The same for each column filtered by, by its key. */
  filterValuesBy: Record<string, { value: string; count: number }[]>;
};

/** "Has anything" and "Empty", for the page's column filter. */
export const FILTER_ANY = "__any";
export const FILTER_NONE = "__none";

/** Copies of each group when printed: 1 to 10. */
export const parseCopies = (v: unknown) => Math.min(10, Math.max(1, Math.round(Number(v)) || 1));

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
    combos: parseCombos(filters),
    copies: parseCopies((filters as { copies?: unknown } | null)?.copies),
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
  scope: { sessionId: string; divisionId?: string; bunkId?: string; divisionIds?: string[] | null; campName?: string; /** Also only these, chosen on the page. */ only?: CamperFlag[]; /** Each bunk's counselors (and phones) under its title: a switch on the page, off by default. */ counselors?: boolean; /** Only campers whose column (key) has this answer (or FILTER_ANY / FILTER_NONE). */ filter?: { key: string; value: string }; /** Several such filters (the page's), all of them or any one (filterMatch). */ filters?: { key: string; value: string }[]; filterMatch?: "all" | "any" },
  fv: FieldVisibilityRow[],
): Promise<BuiltList> {
  // sensitive columns only appear for roles allowed to see them (the data is masked anyway)
  const groupsAnywhere = visibleFieldGroups(user, fv);
  const sortKeys = preset.sort.length ? preset.sort : [{ field: "last_name", dir: "asc" }];
  // extra fields from the registration export ("source.ppa.sleeping_at_the_kinus")
  // combined columns: their parts are loaded like columns of their own
  const combos = new Map((preset.combos ?? []).map((c) => [`combo:${c.id}`, c]));
  const whereKeys = (preset.where ?? []).map((w) => w.key);
  const allKeys = [...preset.columns, ...preset.columns.flatMap((k) => combos.get(k)?.parts ?? []), ...(preset.group_by ? [preset.group_by] : []), ...whereKeys, ...sortKeys.map((k) => k.field)];
  const extraDefs = allKeys.some((k) => k.startsWith("source."))
    ? await import("./extra-fields").then(async (m) => (await m.loadExtraFields()).map((f) => ({ key: `source.${f.column}`, label: f.label, group: m.extraGroupOf(f), kind: "text" as const, answers: f.answers, hide: f.hide })))
    : [];
  const defOf = (k: string) => FIELD_BY_KEY[k] ?? extraDefs.find((f) => f.key === k) ?? (k === SLEEPING_COLUMN ? { key: k, label: SLEEPING_COLUMN_LABEL, group: "basic" as const, kind: "text" as const } : undefined);
  const allowed = (f: { group: FieldGroup }) => UNGATED_GROUPS.includes(f.group) || groupsAnywhere.has(f.group);
  // a combined column's parts this person may see (none: the column isn't shown)
  const comboParts = new Map(
    [...combos.entries()].map(([k, c]) => [k, c.parts.map(defOf).filter((f): f is NonNullable<typeof f> => Boolean(f) && allowed(f!))] as const),
  );
  const shownColumns = preset.columns
    .map((k) => (combos.has(k) ? (comboParts.get(k)!.length ? { key: k, label: combos.get(k)!.label, group: "basic" as const, kind: "text" as const } : undefined) : defOf(k)))
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .filter(allowed);
  // grouped by any field (a bunk, a division, the T-shirt size, an export column…), when this person may see it
  const groupDef = preset.group_by ? defOf(preset.group_by) : undefined;
  const groupKey = groupDef && allowed(groupDef) ? groupDef.key : null;
  // the layout's filters: on fields this person may see (another's filter on a hidden field doesn't apply)
  const where = (preset.where ?? []).filter((w) => {
    const def = defOf(w.key);
    return def && allowed(def);
  });
  const partKeys = [...shownColumns.flatMap((f) => (combos.has(f.key) ? comboParts.get(f.key)!.map((p) => p.key) : [f.key])), ...(groupKey ? [groupKey] : []), ...where.map((w) => w.key)];
  // sorted by any field this person may see (an export column, Sleeping, a combined column on the
  // layout…); one they may not see doesn't sort (its order would give it away)
  const sortBy = sortKeys.filter((k) => (combos.has(k.field) ? shownColumns.some((f) => f.key === k.field) : Boolean(defOf(k.field)) && allowed(defOf(k.field)!)));
  partKeys.push(...sortBy.map((k) => k.field).filter((k) => !combos.has(k) && !partKeys.includes(k)));
  const fields = [...new Set([...partKeys, ...sortKeys.map((s) => s.field), ...(preset.group_by ? [preset.group_by] : [])])].filter((k) => FIELD_BY_KEY[k]);
  // the layout's filters: all of them, or (by default) any one of them; the page's choice narrows it further
  const anyOf = preset.match === "any" && preset.only.length > 1 ? preset.only : [];
  const only = [...new Set([...(anyOf.length ? [] : preset.only), ...(scope.only ?? [])])];
  const [loaded, { data: divisions }] = await Promise.all([
    listCampers(supabase, { sessionId: scope.sessionId, divisionId: scope.divisionId, bunkId: scope.bunkId, divisionIds: scope.divisionIds, fields, only, anyOf }),
    supabase.from("divisions").select("id, name").eq("session_id", scope.sessionId),
  ]);
  let campers = loaded;
  const columns = shownColumns.map((f) => ({ key: f.key, label: f.label }));
  const extraCols = [...new Set(partKeys.filter((k) => k.startsWith("source.")))].map((k) => {
    // its short answers, and the answers set to Hide (they print as nothing, like on the camper page)
    const def = extraDefs.find((f) => f.key === k);
    return { column: k.slice(7), label: defOf(k)?.label, answers: def?.answers, hide: def?.hide };
  });
  // "Sleeping here" / "Going home", from the registration's Sleeping At The Kinus
  const sleeping = partKeys.includes(SLEEPING_COLUMN) ? await import("./sleeping").then((m) => m.sleepingAtKinus(scope.sessionId, campers.map((c) => String(c.id)))) : null;
  const extraValues = extraCols.length ? await import("./extra-fields").then((m) => m.extraValuesFor(campers.map((c) => String(c.id)), extraCols)) : new Map<string, Record<string, string>>();
  // campers in Hebrew-language divisions (Hebrew, French): their names in Hebrew, where the export has them
  const nameKeys = new Set(["display_name", "first_name", "last_name"]);
  const hebrew = [...partKeys, ...sortKeys.map((s) => s.field), "last_name"].some((k) => nameKeys.has(k))
    ? await import("./hebrew-display").then((m) => m.hebrewNamePartsFor(campers.map((c) => ({ id: String(c.id), division_id: (c.division_id as string | null) ?? null })))).catch(() => new Map())
    : new Map();
  const hebrewName = (c: (typeof campers)[number], key: string): string | null => {
    const h = hebrew.get(String(c.id));
    if (!h) return null;
    return (key === "display_name" ? h.full : key === "first_name" ? h.first : key === "last_name" ? h.last : "") || null;
  };

  const cellOf = (c: (typeof campers)[number], key: string): string | boolean | null => {
    if (key.startsWith("source.")) return extraValues.get(String(c.id))?.[key.slice(7)] || null;
    if (key === SLEEPING_COLUMN) return sleepingText(sleeping?.get(String(c.id)));
    if (nameKeys.has(key)) {
      const h = hebrewName(c, key);
      if (h) return h;
    }
    const v = getFieldValue(c, key);
    if (key === "status" && typeof v === "string") return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v;
    if (key.endsWith(".phone") && typeof v === "string") return formatPhone(v);
    return v;
  };
  // a combined column's text: its parts with something in them, joined (a yes/no part says its name when yes)
  const comboText = (c: (typeof campers)[number], key: string): string | null => {
    const combo = combos.get(key)!;
    const bits = comboParts.get(key)!.flatMap((p) => {
      const v = cellOf(c, p.key);
      if (v === null || v === undefined || v === "" || v === false) return [];
      if (v === true) return [p.label];
      return [combo.labels ? `${p.label}: ${v}` : String(v)];
    });
    return bits.length ? bits.join(COMBO_SEPS[combo.sep].text) : null;
  };
  // the page's filter: any column of the list, or a field inside a combined column
  const filterOptions = shownColumns.flatMap((f) =>
    combos.has(f.key) ? [{ key: f.key, label: f.label }, ...comboParts.get(f.key)!.map((p) => ({ key: p.key, label: `${f.label} → ${p.label}` }))] : [{ key: f.key, label: f.label }],
  );
  // the page's filters (on columns of this list): every one, or any one of them
  const pageFilters = [...(scope.filter ? [scope.filter] : []), ...(scope.filters ?? [])].filter((f) => filterOptions.some((o) => o.key === f.key));
  const fKey = pageFilters[0]?.key ?? null;
  const textOf = (c: (typeof campers)[number], key: string) => {
    const v = combos.has(key) ? comboText(c, key) : cellOf(c, key);
    return v === null || v === undefined || v === "" ? "" : typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? (v as string[]).join(", ") : String(v);
  };
  // the layout's filters ("T-shirt is M or L", "Grade is 4", "Allergies: has anything"): every one must match
  if (where.length) {
    const { shortAnswer } = await import("@/lib/import/extra-fields");
    const norm = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase();
    const answersOf = new Map(extraCols.map((e) => [`source.${e.column}`, e]));
    campers = campers.filter((c) =>
      where.every((w) => {
        const t = textOf(c, w.key);
        const short = w.key.startsWith("source.") && t ? shortAnswer(answersOf.get(w.key) ?? {}, t) : "";
        return w.values.some((v) => (v === WHERE_EMPTY ? !hasContent(t) : v === WHERE_ANY ? hasContent(t) : norm(v) === norm(t) || (short !== "" && norm(v) === norm(short))));
      }),
    );
  }
  const whereText = (w: ColumnFilter) => `${defOf(w.key)?.label ?? w.key}: ${w.values.map((v) => (v === WHERE_EMPTY ? "empty" : v === WHERE_ANY ? "has something" : v)).join(" or ")}`;
  const valuesOf = (key: string) => {
    const counts = new Map<string, number>();
    for (const c of campers) {
      const t = textOf(c, key);
      if (hasContent(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true })).slice(0, 200).map(([value, count]) => ({ value, count }));
  };
  const filterValuesBy = Object.fromEntries([...new Set(pageFilters.map((f) => f.key))].map((k) => [k, valuesOf(k)]));
  const filterValues = fKey ? filterValuesBy[fKey] : [];
  const passes = (c: (typeof campers)[number], f: { key: string; value: string }) => {
    const t = textOf(c, f.key);
    return f.value === FILTER_ANY ? hasContent(t) : f.value === FILTER_NONE ? !hasContent(t) : t === f.value;
  };
  const anyFilter = scope.filterMatch === "any" && pageFilters.length > 1;
  const shownCampers = pageFilters.length ? campers.filter((c) => (anyFilter ? pageFilters.some((f) => passes(c, f)) : pageFilters.every((f) => passes(c, f)))) : campers;
  const filterText = pageFilters.map((f) => `${filterOptions.find((o) => o.key === f.key)!.label}: ${f.value === FILTER_ANY ? "has something" : f.value === FILTER_NONE ? "empty" : f.value}`);
  // Kinus' own fields by their value (a grade as a number); anything else by what the list shows
  const sortValue = (c: (typeof campers)[number], key: string) => (nameKeys.has(key) ? (hebrewName(c, key) ?? getFieldValue(c, key)) : FIELD_BY_KEY[key] ? getFieldValue(c, key) : textOf(c, key) || null);
  const sorted = [...shownCampers].sort((a, b) => {
    // then by name, so campers with the same answer are in order
    for (const s of [...sortBy, { field: "last_name", dir: "asc" }, { field: "first_name", dir: "asc" }]) {
      const r = cmp(sortValue(a, s.field), sortValue(b, s.field));
      if (r !== 0) return s.dir === "desc" ? -r : r;
    }
    return 0;
  });
  const groupsMap = new Map<string, BuiltList["groups"][number]>();
  const bunkOfGroup = new Map<string, string>();
  for (const c of sorted) {
    const g = groupKey ? cellOf(c, groupKey) : null;
    const title = !groupKey ? "" : g === null || g === undefined || g === "" ? (groupKey === "bunk" ? "Unassigned" : `No ${groupDef!.label.toLowerCase()}`) : typeof g === "boolean" ? `${groupDef!.label}: ${g ? "Yes" : "No"}` : String(g);
    if (groupKey === "bunk" && c.bunk_id && !bunkOfGroup.has(title)) bunkOfGroup.set(title, String(c.bunk_id));
    if (!groupsMap.has(title)) groupsMap.set(title, { title, rows: [] });
    groupsMap.get(title)!.rows.push({
      id: c.id!,
      cells: columns.map((col) => (combos.has(col.key) ? comboText(c, col.key) : cellOf(c, col.key))),
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
    // bunks and divisions in the camp's order; any other field's groups A–Z, the empty one last
    groups:
      groupKey === "bunk" || groupKey === "division" || !groupKey
        ? await inCampOrder(supabase, scope.sessionId, groupKey, [...groupsMap.values()])
        : [...groupsMap.values()].sort((a, b) => Number(a.title.startsWith("No ")) - Number(b.title.startsWith("No ")) || a.title.localeCompare(b.title, undefined, { numeric: true })),
    scopeLabel: [[divName, bunkName].filter(Boolean).join(" · ") || (scope.campName ? `All of ${scope.campName}` : "All divisions"), ...(anyOf.length ? [anyOf.map((k) => CAMPER_FLAGS[k].label).join(" or ")] : []), ...only.map((k) => CAMPER_FLAGS[k].label), ...where.map(whereText), ...(filterText.length ? [filterText.join(anyFilter ? " or " : " · ")] : [])].join(" · "),
    filterOptions,
    filterValues,
    filterValuesBy,
  };
}
