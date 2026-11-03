import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canTextStaff, canUsePhoneBook, canUsePrintArea, isAdmin, isDirector, seesAllCamp, textableDivisionIds, visibleFieldGroups, type CurrentUser } from "@/lib/auth/permissions";
import { matchScore, searchEntry } from "@/lib/search";
import { listCamperIndex } from "@/lib/data/campers";
import { loadExtraFields, visibleExtraFields } from "@/lib/data/extra-fields";
import { columnKey } from "@/lib/import/extra-fields";
import { formatPhone } from "@/lib/utils";

/** The parts of Kinus the Search page looks in. */
export const SEARCH_PARTS = {
  campers: "Campers",
  staff: "Staff",
  activity: "Activity log",
  print: "Print requests",
  templates: "Templates",
  places: "Divisions & bunks",
  texts: "Texts",
  imports: "Imports",
} as const;
export type SearchPart = keyof typeof SEARCH_PARTS;

export type SearchHit = { href: string; title: string; detail?: string; matched?: string; at?: string | null };

/** The parts this person may search (the activity log, imports: owners and directors). */
export function partsFor(user: CurrentUser): SearchPart[] {
  const out: SearchPart[] = ["campers"];
  if (isAdmin(user) || canUsePhoneBook(user)) out.push("staff");
  if (isDirector(user)) out.push("activity");
  if (canUsePrintArea(user)) out.push("print", "templates");
  out.push("places");
  if (canTextStaff(user)) out.push("texts");
  if (isAdmin(user)) out.push("imports");
  return out;
}

/** "50%_off" as an ilike pattern that means exactly that text, anywhere. */
const pattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const has = (v: string | null | undefined, q: string) => Boolean(v && v.toLowerCase().includes(q.toLowerCase()));

/**
 * Campers the person sees, by name (in any order, misspelt, in Hebrew), code, buzzer or a
 * parent's phone, and by anything in the export's columns they may see ("Medium", a school…).
 */
export async function searchCampers(user: CurrentUser, sessionId: string, q: string, divisionIds: string[] | null, limit = 60): Promise<SearchHit[]> {
  const supabase = await createClient();
  const { data: fv } = await supabase.from("field_visibility").select("field_group, roles");
  const groups = visibleFieldGroups(user, fv ?? []);
  const [rows, { data: divs }, { data: bunks }] = await Promise.all([
    listCamperIndex(supabase, { sessionId, divisionIds, withPhones: groups.has("contacts") }),
    supabase.from("divisions").select("id, name").eq("session_id", sessionId),
    supabase.from("bunks").select("id, name, divisions!inner(session_id)").eq("divisions.session_id", sessionId),
  ]);
  const dName = new Map((divs ?? []).map((d) => [d.id, d.name]));
  const bName = new Map((bunks ?? []).map((b) => [b.id, b.name]));
  const where = (r: (typeof rows)[number]) => [r.d ? dName.get(r.d) : null, r.b ? bName.get(r.b) : "no bunk"].filter(Boolean).join(" · ");
  const hits = new Map<string, SearchHit & { score: number }>();
  for (const r of rows) {
    const score = matchScore(searchEntry(r.h ? `${r.n} ${r.h}` : r.n, r.c, r.p ?? [], r.z ?? null), q);
    if (score > 0) hits.set(r.i, { href: `/campers/${r.i}`, title: r.h ?? r.n, detail: `${r.h ? `${r.n} · ` : ""}${where(r)} · ${r.c}`, score: score + 10 });
  }
  // the export's columns: only the ones this person may see, for campers they see
  if (q.trim().length >= 2) {
    const visible = visibleExtraFields(await loadExtraFields(), groups);
    const label = new Map(visible.map((f) => [columnKey(f.column), f.label]));
    const rpc = createAdminClient().rpc.bind(createAdminClient()) as unknown as (f: string, a: object) => PromiseLike<{ data: { camper_id: string; key: string; value: string }[] | null; error: unknown }>;
    const { data } = await rpc("search_camper_columns", { p_session_id: sessionId, p_pattern: pattern(q.trim()), p_limit: 400 });
    const seen = new Map(rows.map((r) => [r.i, r]));
    for (const m of data ?? []) {
      const r = seen.get(m.camper_id);
      const name = label.get(columnKey(m.key));
      if (!r || !name || hits.has(r.i)) continue;
      hits.set(r.i, { href: `/campers/${r.i}`, title: r.h ?? r.n, detail: where(r), matched: `${name}: ${m.value}`, score: 1 });
    }
  }
  return [...hits.values()].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}

/** Staff: directors over all of camp search everyone (name, email, phone, title); others their phone book. */
export async function searchStaff(user: CurrentUser, sessionId: string, q: string, divisionIds: string[] | null): Promise<SearchHit[]> {
  if (isAdmin(user)) {
    const p = pattern(q.trim());
    const digits = q.replace(/\D/g, "");
    const { data } = await createAdminClient()
      .from("profiles")
      .select("id, full_name, email, phone, title, role, login")
      .or([`full_name.ilike.${p}`, `email.ilike.${p}`, `title.ilike.${p}`, ...(digits.length >= 4 ? [`phone.ilike.%${digits}%`] : [])].join(","))
      .neq("login", "shared")
      .order("full_name")
      .limit(40);
    return (data ?? []).map((s) => ({ href: `/admin/users/${s.id}`, title: s.full_name, detail: [s.title, s.phone ? formatPhone(s.phone) : null, s.email && !/^no-email\./.test(s.email) ? s.email : null].filter(Boolean).join(" · ") }));
  }
  if (!canUsePhoneBook(user)) return [];
  const { loadPhoneBook } = await import("@/lib/data/phone-book");
  const book = await loadPhoneBook(user, sessionId, divisionIds);
  const digits = q.replace(/\D/g, "");
  const out = new Map<string, SearchHit>();
  for (const s of book)
    for (const e of s.entries)
      if (has(e.name, q) || has(e.title, q) || (digits.length >= 4 && (e.phone ?? "").replace(/\D/g, "").includes(digits)))
        out.set(e.id, { href: "/phone-book", title: e.name, detail: [e.title, e.where, e.phone ? formatPhone(e.phone) : null].filter(Boolean).join(" · ") });
  return [...out.values()].slice(0, 40);
}

/** Activity log entries that mention the text, or were made by someone whose name matches. Owners and directors. */
export async function searchActivity(user: CurrentUser, q: string, before?: number | null, limit = 30) {
  if (!isDirector(user)) return [];
  const admin = createAdminClient();
  const { data: people } = await admin.from("profiles").select("id").ilike("full_name", pattern(q.trim())).limit(20);
  const rpc = admin.rpc.bind(admin) as unknown as (f: string, a: object) => PromiseLike<{ data: import("@/lib/supabase/database.types").Database["public"]["Tables"]["audit_log"]["Row"][] | null; error: unknown }>;
  const { data, error } = await rpc("search_audit", { p_pattern: pattern(q.trim()), p_actor_ids: (people ?? []).map((p) => p.id), p_before: before ?? null, p_limit: limit });
  if (error) throw error;
  return data ?? [];
}

/** Print requests: their note, or their template's name. */
export async function searchPrint(user: CurrentUser, sessionId: string, q: string): Promise<SearchHit[]> {
  if (!canUsePrintArea(user)) return [];
  const admin = createAdminClient();
  const p = pattern(q.trim());
  const { data: templates } = await admin.from("print_templates").select("id").ilike("name", p).limit(50);
  const ids = (templates ?? []).map((t) => t.id);
  const { data } = await admin
    .from("print_jobs")
    .select("id, note, status, item_count, requested_at, print_templates(name)")
    .eq("session_id", sessionId)
    .or([`note.ilike.${p}`, ...(ids.length ? [`template_id.in.(${ids.join(",")})`] : [])].join(","))
    .order("requested_at", { ascending: false })
    .limit(40);
  let jobs = data ?? [];
  // someone over part of camp: only their part's requests (as on the queue)
  if (!seesAllCamp(user) && jobs.length) {
    const { myAreaJobIds } = await import("@/lib/print/access");
    const mine = await myAreaJobIds(user, sessionId);
    jobs = jobs.filter((j) => mine.has(j.id));
  }
  return jobs.map((j) => ({ href: `/print/jobs/${j.id}`, title: `${(j.print_templates as { name: string } | null)?.name ?? "Print request"}${j.item_count > 1 ? ` · ${j.item_count} tags` : ""}`, detail: [j.note, j.status].filter(Boolean).join(" · "), at: j.requested_at }));
}

export async function searchTemplates(user: CurrentUser, q: string): Promise<SearchHit[]> {
  if (!canUsePrintArea(user)) return [];
  const { data } = await createAdminClient().from("print_templates").select("id, name, kind").ilike("name", pattern(q.trim())).not("name", "like", "(retired)%").order("name").limit(30);
  return (data ?? []).map((t) => ({ href: `/print/templates/${t.id}`, title: t.name, detail: t.kind.replace("_", " ") }));
}

/** Divisions, bunks and camps by name: each opens Who's here for that place. */
export async function searchPlaces(sessionId: string, q: string, divisionIds: string[] | null): Promise<SearchHit[]> {
  const supabase = await createClient();
  const p = pattern(q.trim());
  const [{ data: divs }, { data: bunks }] = await Promise.all([
    supabase.from("divisions").select("id, name").eq("session_id", sessionId).ilike("name", p).limit(30),
    supabase.from("bunks").select("id, name, division_id, divisions!inner(name, session_id)").eq("divisions.session_id", sessionId).ilike("name", p).limit(60),
  ]);
  const ok = (id: string) => !divisionIds || divisionIds.includes(id);
  return [
    ...(divs ?? []).filter((d) => ok(d.id)).map((d) => ({ href: `/campers?division=${d.id}`, title: d.name, detail: "Division" })),
    ...(bunks ?? []).filter((b) => ok(b.division_id)).map((b) => ({ href: `/campers?division=${b.division_id}&bunk=${b.id}`, title: b.name, detail: `Bunk · ${(b.divisions as { name: string } | null)?.name ?? ""}` })),
  ];
}

/** Texts sent to staff: the ones this person sent, or sent to divisions they text. */
export async function searchTexts(user: CurrentUser, q: string): Promise<SearchHit[]> {
  if (!canTextStaff(user)) return [];
  const { data } = await createAdminClient().from("text_broadcasts").select("id, body, sender_name, sent_by, division_ids, created_at").ilike("body", pattern(q.trim())).order("created_at", { ascending: false }).limit(40);
  const mine = textableDivisionIds(user);
  return (data ?? [])
    .filter((t) => !mine || t.sent_by === user.id || t.division_ids.some((d) => mine.includes(d)))
    .map((t) => ({ href: `/messages/${t.id}`, title: t.body.length > 90 ? `${t.body.slice(0, 90)}…` : t.body, detail: `Sent by ${t.sender_name}`, at: t.created_at }));
}

export async function searchImports(user: CurrentUser, q: string): Promise<SearchHit[]> {
  if (!isAdmin(user)) return [];
  const { data } = await createAdminClient().from("imports").select("id, file_name, status, uploaded_at").ilike("file_name", pattern(q.trim())).order("uploaded_at", { ascending: false }).limit(20);
  return (data ?? []).map((i) => ({ href: `/admin/imports/${i.id}`, title: i.file_name, detail: i.status, at: i.uploaded_at }));
}
