import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ContactLike } from "@/lib/fields";
import { fetchAll } from "@/lib/supabase/fetch-all";

type DB = SupabaseClient<Database>;
export type CamperVisible = Database["public"]["Views"]["campers_visible"]["Row"];
export type CamperRow = CamperVisible & { division_name: string | null; bunk_name: string | null; contacts: ContactLike[] };

export type CamperFilter = {
  sessionId: string;
  /** Only these divisions (a camp); null/undefined = no limit. */
  divisionIds?: string[] | null;
  /** Only these field keys (see lib/fields); undefined = everything. */
  fields?: string[];
  divisionId?: string;
  bunkId?: string;
  status?: string;
  q?: string;
  includeArchived?: boolean;
};

const ALWAYS = ["id", "display_name", "first_name", "last_name", "division_id", "bunk_id", "status", "archived_at"];
const COLUMN_FOR: Record<string, string> = { division: "division_id", bunk: "bunk_id" };
/** The view columns needed for these field keys (masked columns cost a check per row: only ask for used ones). */
function selectFor(fields: string[]): string {
  const cols = new Set(ALWAYS);
  for (const k of fields) if (!k.startsWith("contact.")) cols.add(COLUMN_FOR[k] ?? k);
  return [...cols].join(", ");
}

/** Scope-filtered (RLS) camper list with division/bunk names and visible contacts. */
export async function listCampers(supabase: DB, f: CamperFilter): Promise<CamperRow[]> {
  let ids: string[] | null = null;
  if (f.q && f.q.trim()) {
    const { data } = await supabase.rpc("search_campers", { p_session_id: f.sessionId, p_q: f.q.trim(), p_limit: 100 });
    ids = (data ?? []).map((r) => r.id);
    if (ids.length === 0) return [];
  }
  if (f.divisionIds && !f.divisionIds.length) return [];
  const columns = f.fields ? selectFor(f.fields) : "*";
  const withContacts = !f.fields || f.fields.some((k) => k.startsWith("contact."));
  const rows = await fetchAll<CamperVisible>((from, to) => {
    // typed as "*": rows carry only the asked-for columns, and the code only reads those
    let query = supabase.from("campers_visible").select(columns as "*").eq("session_id", f.sessionId);
    if (!f.includeArchived) query = query.is("archived_at", null);
    if (f.divisionIds) query = query.in("division_id", f.divisionIds);
    if (f.divisionId) query = query.eq("division_id", f.divisionId);
    if (f.bunkId) query = query.eq("bunk_id", f.bunkId);
    if (f.status) query = query.eq("status", f.status as NonNullable<CamperVisible["status"]>);
    if (ids) query = query.in("id", ids);
    return query.order("last_name").order("first_name").order("id").range(from, to);
  });
  const [{ data: divisions }, { data: bunks }, contacts] = await Promise.all([
    supabase.from("divisions").select("id, name").eq("session_id", f.sessionId),
    supabase.from("bunks").select("id, name, divisions!inner(session_id)").eq("divisions.session_id", f.sessionId),
    !withContacts ? Promise.resolve([]) : fetchAll((from, to) => {
      // Only the contacts of the campers in this list: filter by the same division/bunk.
      let q = supabase
        .from("camper_contacts")
        .select("camper_id, role, slot, name, phone, phone_e164, email, campers!inner(session_id, division_id, bunk_id)")
        .eq("campers.session_id", f.sessionId);
      if (f.divisionIds) q = q.in("campers.division_id", f.divisionIds);
      if (f.divisionId) q = q.eq("campers.division_id", f.divisionId);
      if (f.bunkId) q = q.eq("campers.bunk_id", f.bunkId);
      return q.order("id").range(from, to);
    }),
  ]);
  const dName = new Map((divisions ?? []).map((d) => [d.id, d.name]));
  const bName = new Map((bunks ?? []).map((b) => [b.id, b.name]));
  const byCamper = new Map<string, ContactLike[]>();
  for (const c of contacts) {
    const list = byCamper.get(c.camper_id) ?? [];
    list.push({ role: c.role, slot: c.slot, name: c.name, phone: c.phone, phone_e164: c.phone_e164, email: c.email });
    byCamper.set(c.camper_id, list);
  }
  const out = rows.map((c) => ({
    ...c,
    division_name: c.division_id ? (dName.get(c.division_id) ?? null) : null,
    bunk_name: c.bunk_id ? (bName.get(c.bunk_id) ?? null) : null,
    contacts: byCamper.get(c.id!) ?? [],
  }));
  if (ids) {
    const rank = new Map(ids.map((id, i) => [id, i]));
    out.sort((a, b) => (rank.get(a.id!) ?? 0) - (rank.get(b.id!) ?? 0));
  }
  return out;
}

/** One camper with names and contacts, in a single round trip. */
export async function getCamper(supabase: DB, id: string): Promise<CamperRow | null> {
  const [{ data: c }, { data: contacts }] = await Promise.all([
    supabase.from("campers_visible").select("*, division:divisions(name), bunk:bunks(name)").eq("id", id).maybeSingle(),
    supabase.from("camper_contacts").select("role, slot, name, phone, phone_e164, email, source, id, can_pickup").eq("camper_id", id).order("role").order("slot"),
  ]);
  if (!c) return null;
  const { division, bunk, ...rest } = c as typeof c & { division: { name: string } | null; bunk: { name: string } | null };
  return { ...rest, division_name: division?.name ?? null, bunk_name: bunk?.name ?? null, contacts: contacts ?? [] };
}

/** One camper in the campers page's in-browser index (short keys: ~1,000 of these are sent at once). */
export type CamperIndexRow = {
  i: string; // id
  n: string; // display name
  l: string; // last name, for sorting
  c: string; // code
  d: string | null; // division id
  b: string | null; // bunk id
  g: string | null; // grade
  s: NonNullable<CamperVisible["status"]>;
  m?: 1; // medical flag
  x?: 1; // not in the latest export
  a?: 1; // archived
  p?: string[]; // parent phone numbers, for search
};

/** Just what the campers page shows and searches, for a camp's divisions (null = all). */
export async function listCamperIndex(
  supabase: DB,
  f: { sessionId: string; divisionIds: string[] | null; includeArchived?: boolean; withPhones: boolean },
): Promise<CamperIndexRow[]> {
  if (f.divisionIds && !f.divisionIds.length) return [];
  const [rows, phones] = await Promise.all([
    fetchAll((from, to) => {
      let q = supabase
        .from("campers_visible")
        .select("id, display_name, last_name, camper_code, division_id, bunk_id, grade, status, has_medical_flag, in_latest_import, archived_at")
        .eq("session_id", f.sessionId);
      if (!f.includeArchived) q = q.is("archived_at", null);
      if (f.divisionIds) q = q.in("division_id", f.divisionIds);
      return q.order("id").range(from, to);
    }),
    f.withPhones
      ? fetchAll((from, to) => {
          let q = supabase.from("camper_contacts").select("camper_id, phone_e164, campers!inner(session_id, division_id)").eq("campers.session_id", f.sessionId).not("phone_e164", "is", null);
          if (f.divisionIds) q = q.in("campers.division_id", f.divisionIds);
          return q.order("id").range(from, to);
        })
      : Promise.resolve([]),
  ]);
  const byCamper = new Map<string, string[]>();
  for (const k of phones) {
    const list = byCamper.get(k.camper_id) ?? [];
    list.push(k.phone_e164!);
    byCamper.set(k.camper_id, list);
  }
  return rows.map((c) => {
    const r: CamperIndexRow = { i: c.id!, n: c.display_name ?? "", l: c.last_name ?? "", c: c.camper_code ?? "", d: c.division_id, b: c.bunk_id, g: c.grade, s: c.status! };
    if (c.has_medical_flag) r.m = 1;
    if (c.in_latest_import === false) r.x = 1;
    if (c.archived_at) r.a = 1;
    const p = byCamper.get(c.id!);
    if (p) r.p = p;
    return r;
  });
}
