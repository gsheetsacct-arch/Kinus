import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { seesAllCamp, type CurrentUser } from "@/lib/auth/permissions";
import { loadAreaTree } from "@/lib/data/areas";
import { continuedDivisionNumbers } from "./bunk-continued";

/** A Thursday Program camp ("Thursday American"…): its records are second copies of campers. */
const isThursdayCamp = (name: string) => /^thursday\b/i.test(name.trim());
import { STAFF_ROLES } from "@/lib/labels";
import { shownEmail } from "@/lib/staff/login-kinds";
import { withNameTagDivision } from "@/lib/staff/name-tag";
import { backgroundDataUrl, imageDataUrls } from "./data";
import { renderDocument } from "./render";
import { customFontCss } from "./custom-fonts";
import { SAMPLE_STAFF, STAFF_FIELDS, staffValues, type StaffPerson } from "./staff-values";
import { fill } from "./merge";
import { widthEstimate } from "./width-estimate";
import { worstValues } from "./worst-case";
import type { TemplateSpec } from "./types";

export type StaffToPrint = { id: string; name: string; role: string; title: string | null; divisionIds: string[]; values: Record<string, string> };

const roleLabel = (r: string) => STAFF_ROLES[r as keyof typeof STAFF_ROLES]?.label ?? r;

/**
 * The staff this person may print tags for, with each one's values: everyone for directors
 * and the office over all of camp, otherwise the staff of their own divisions. Check-in logins
 * (phones, not people) are left out.
 */
export async function staffInView(me: CurrentUser): Promise<StaffToPrint[]> {
  const admin = createAdminClient();
  const { data: session } = await admin.from("sessions").select("id").eq("is_active", true).maybeSingle();
  const [tree, { data: people }, { data: scopes }, reg, tagSet] = await Promise.all([
    loadAreaTree(admin, session?.id),
    admin.from("profiles").select("id, full_name, role, title, phone, email, all_areas").eq("is_active", true).neq("login", "shared").order("full_name"),
    admin.from("staff_scopes").select("user_id, group_id, division_id, bunk_id"),
    // registration details (migration 0040): read on their own, so tags print before it's applied
    admin.from("profiles").select("id, source_id, details, address").then((r) => r.data ?? [], () => []),
    // the name-tag division set in Kinus (migration 0061), on its own for the same reason
    admin
      .from("profiles")
      .select("id, name_tag_division")
      .not("name_tag_division", "is", null)
      .then((r) => (r.error ? [] : (r.data ?? [])), () => []),
  ]);
  const tagDivisionOf = new Map(tagSet.map((r) => [r.id, r.name_tag_division]));
  const regOf = new Map(reg.map((r) => [r.id, r]));
  const camp = new Map(tree.groups.map((g) => [g.id, g.name]));
  const division = new Map(tree.divisions.map((d) => [d.id, d]));
  const bunk = new Map(tree.divisions.flatMap((d) => d.bunks.map((b) => [b.id, b.name] as const)));
  const mine = new Set(me.coverage.map((c) => c.division_id));
  // each division's staff number, after the last bunk number (camps in order; a division with no camp is in the first).
  // The Thursday Program's camps don't count: no luggage tags there, so their bunks don't move
  // the numbers, and their divisions get none
  const firstCamp = tree.groups[0]?.id ?? null;
  const counted = tree.groups.filter((g) => !isThursdayCamp(g.name)).map((g) => g.id);
  const number = continuedDivisionNumbers((tree.groups.length ? counted : [null]).map((gid) => tree.divisions.filter((d) => (d.group_id ?? firstCamp) === gid)));
  const out: StaffToPrint[] = [];
  for (const p of people ?? []) {
    const places: StaffPerson["places"] = [];
    const divisionIds: string[] = [];
    for (const s of (scopes ?? []).filter((x) => x.user_id === p.id)) {
      const ds = s.group_id ? tree.divisions.filter((d) => d.group_id === s.group_id) : s.division_id && division.has(s.division_id) ? [division.get(s.division_id)!] : [];
      for (const d of ds) {
        divisionIds.push(d.id);
        places.push({ division: d.name, color: d.color, camp: d.group_id ? (camp.get(d.group_id) ?? null) : null, bunk: s.bunk_id ? (bunk.get(s.bunk_id) ?? null) : null, number: number.get(d.id) ?? null });
      }
    }
    if (!seesAllCamp(me) && (p.all_areas || p.role === "owner" || !divisionIds.some((d) => mine.has(d)))) continue;
    const r = regOf.get(p.id) as { source_id?: string | null; details?: unknown; address?: unknown } | undefined;
    const person: StaffPerson = {
      name: p.full_name,
      role: p.role,
      title: p.title,
      phone: p.phone,
      email: shownEmail(p.email),
      sourceId: r?.source_id ?? null,
      details: withNameTagDivision((r?.details as Record<string, string> | null) ?? null, tagDivisionOf.get(p.id)),
      address: (r?.address as StaffPerson["address"]) ?? null,
      places,
    };
    out.push({ id: p.id, name: p.full_name, role: p.role, title: p.title, divisionIds: [...new Set(divisionIds)], values: staffValues(person, roleLabel) });
  }
  return out;
}

/** Staff tags as one printable page (the browser prints it): the template filled for each person. */
export async function staffSheetHtml(spec: TemplateSpec, items: { values: Record<string, string>; copies: number }[]): Promise<string> {
  const admin = createAdminClient();
  const [background, images, fontCss] = await Promise.all([backgroundDataUrl(admin, spec.background_path), imageDataUrls(admin, spec.layers), customFontCss(spec)]);
  return renderDocument(spec, items, { background, images, fontCss });
}

/** The made-up staff member previews start with. */
export const sampleStaffValues = () => staffValues(SAMPLE_STAFF, roleLabel);

/**
 * A staff template filled for a preview: the made-up staff member ("sample"), every field's
 * longest value at once ("worst"), the staff member whose text is longest for its box on these
 * parts ("longest"), or someone by name.
 */
export async function staffPreview(
  user: CurrentUser,
  who: string,
  texts: { text: string; w: number }[] = [],
): Promise<{ values: Record<string, string>; label: string } | { error: string }> {
  const sample = { values: sampleStaffValues(), label: "a sample staff member" };
  const w = who.trim().toLowerCase();
  if (!w || w === "sample") return sample;
  const people = await staffInView(user);
  if (!people.length) return { ...sample, label: "a sample staff member (no staff yet)" };
  if (w === "worst") {
    const keys = [...new Set(people.flatMap((p) => Object.keys(p.values)))];
    const widest = Object.fromEntries(keys.map((k) => [k, people.map((p) => p.values[k] ?? "").reduce((a, b) => (widthEstimate(b) > widthEstimate(a) ? b : a), "")]));
    // the fields printed together (first and last name) from one real person: lib/print/worst-case
    return { values: worstValues(people.map((p) => p.values), texts, widest), label: "the longest of every field" };
  }
  if (w === "longest") {
    const parts = texts.filter((t) => t.text.includes("{{") && t.w > 0).slice(0, 30);
    const score = (p: StaffToPrint) => (parts.length ? Math.max(...parts.map((t) => fill(t.text, (k) => p.values[k] ?? "").length / t.w)) : p.name.length);
    const best = people.reduce((a, b) => (score(b) > score(a) ? b : a));
    return { values: best.values, label: `${best.name} (longest text)` };
  }
  const named = people.find((p) => p.name.toLowerCase().includes(w));
  return named ? { values: named.values, label: named.name } : { error: `No staff member called “${who}” that you can see.` };
}

/** For each staff field, the longest real values (to size parts for), and how many have it. */
export async function staffLongest(user: CurrentUser, keys?: string[], top = 5) {
  const people = await staffInView(user);
  return STAFF_FIELDS.filter((f) => !keys?.length || keys.includes(f.key)).map((f) => {
    const filled = people.filter((p) => (p.values[f.key] ?? "").trim());
    const longest = [...filled].sort((a, b) => (b.values[f.key] ?? "").length - (a.values[f.key] ?? "").length).slice(0, top);
    return { key: f.key, label: f.label, filled: filled.length, longest: longest.map((p) => ({ value: p.values[f.key], letters: p.values[f.key].length, person: p.name })) };
  });
}

/** A blank badge's values: a division's design (its picture, its name), with no name on it. */
export const blankStaffValues = (division: string) => staffValues({ name: "", role: "staff", title: null, phone: null, email: null, details: { "Division (name tag)": division }, places: [] }, () => "");

/**
 * Staff tags for the print queue: these people (only those this person may print for) as
 * their tags read now, and blank badges for a division.
 */
export async function staffQueueItems(me: CurrentUser, opts: { ids?: string[]; copies?: number; blank?: { count: number; division: string } | null }) {
  const copies = Math.min(10, Math.max(1, Math.round(opts.copies ?? 1)));
  const items: { id?: string; name: string; division: string; values: Record<string, string>; copies: number }[] = [];
  if (opts.ids?.length) {
    const want = new Set(opts.ids);
    for (const p of await staffInView(me)) if (want.has(p.id)) items.push({ id: p.id, name: p.name, division: p.values.DIVISION ?? "", values: p.values, copies });
  }
  if (opts.blank && opts.blank.count > 0 && opts.blank.division.trim()) {
    const values = blankStaffValues(opts.blank.division.trim());
    for (let i = 0; i < Math.min(300, opts.blank.count); i++) items.push({ name: "", division: opts.blank.division.trim(), values, copies: 1 });
  }
  return items;
}

/**
 * Of these staff members, the ones whose tag on this template is new or says something else
 * than when it was last asked for (printed or still in the queue): their name, role, bunk,
 * the division that picks its design… only what the template shows. A tag asked for before
 * Kinus kept the person on it is matched by name.
 */
export async function staffChangedSince(templateId: string, people: { id: string; name: string; values: Record<string, string> }[]): Promise<Set<string>> {
  return new Set((await staffTagKinds(templateId, people)).keys());
}

/**
 * Whose tag on this template is new (never printed or queued) and whose was printed before but
 * says something else now ("updated"); those whose last tag says the same aren't in it.
 */
export async function staffTagKinds(templateId: string, people: { id: string; name: string; values: Record<string, string> }[]): Promise<Map<string, "new" | "updated">> {
  const admin = createAdminClient();
  const [{ data: template }, { data: jobs, error }] = await Promise.all([
    admin.from("print_templates").select("*").eq("id", templateId).maybeSingle(),
    admin.from("print_jobs").select("staff_items, requested_at, status").eq("template_id", templateId).neq("status", "cancelled").order("requested_at", { ascending: false }),
  ]);
  // never "everyone changed" because the queue couldn't be read
  if (error) throw new Error(`Couldn't read what was printed before: ${error.message}`);
  if (!template) return new Map(people.map((p) => [p.id, "new" as const]));
  const [{ toSpec }, { templateKeys, labelValues, contentHash }, { parseStaffItems }] = await Promise.all([import("./data"), import("./content"), import("./jobs")]);
  const spec = toSpec(template);
  const keys = templateKeys(spec);
  const said = (values: Record<string, string>) => contentHash(keys, labelValues(spec, values));
  const name = (n: string) => n.replace(/\s+/g, " ").trim().toLowerCase();
  // each person's latest tag (newest job first); a tag from before Kinus kept who it was for is
  // known only by name, and two records of one name (a counselor and their Thursday record)
  // can't be told apart there: any of that name's last tags saying the same counts as printed
  const byId = new Map<string, string>();
  const byName = new Map<string, Set<string>>();
  const namedJobs = new Map<string, unknown>();
  for (const j of (jobs ?? []) as { staff_items?: unknown }[])
    for (const it of parseStaffItems(j.staff_items)) {
      if (!it.name) continue; // a blank badge
      if (it.id) {
        if (!byId.has(it.id)) byId.set(it.id, said(it.values));
        continue;
      }
      const n = name(it.name);
      // the newest request with this name only (its records' tags as last printed)
      if (namedJobs.has(n) && namedJobs.get(n) !== j) continue;
      namedJobs.set(n, j);
      byName.set(n, (byName.get(n) ?? new Set()).add(said(it.values)));
    }
  const kinds = new Map<string, "new" | "updated">();
  for (const p of people) {
    const now = said(p.values);
    const last = byId.get(p.id);
    const named = byName.get(name(p.name));
    if (last !== undefined) {
      if (last !== now) kinds.set(p.id, "updated");
    } else if (!named) kinds.set(p.id, "new");
    else if (!named.has(now)) kinds.set(p.id, "updated");
  }
  return kinds;
}
