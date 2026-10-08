import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ContactLike } from "@/lib/fields";

type DB = SupabaseClient<Database>;
export type CamperVisible = Database["public"]["Views"]["campers_visible"]["Row"];
export type CamperRow = CamperVisible & { division_name: string | null; bunk_name: string | null; contacts: ContactLike[] };

export type CamperFilter = {
  sessionId: string;
  divisionId?: string;
  bunkId?: string;
  status?: string;
  q?: string;
  includeArchived?: boolean;
};

/** Scope-filtered (RLS) camper list with division/bunk names and visible contacts. */
export async function listCampers(supabase: DB, f: CamperFilter): Promise<CamperRow[]> {
  let ids: string[] | null = null;
  if (f.q && f.q.trim()) {
    const { data } = await supabase.rpc("search_campers", { p_session_id: f.sessionId, p_q: f.q.trim(), p_limit: 100 });
    ids = (data ?? []).map((r) => r.id);
    if (ids.length === 0) return [];
  }
  let query = supabase.from("campers_visible").select("*").eq("session_id", f.sessionId);
  if (!f.includeArchived) query = query.is("archived_at", null);
  if (f.divisionId) query = query.eq("division_id", f.divisionId);
  if (f.bunkId) query = query.eq("bunk_id", f.bunkId);
  if (f.status) query = query.eq("status", f.status as NonNullable<CamperVisible["status"]>);
  if (ids) query = query.in("id", ids);
  const { data: campers, error } = await query.order("last_name").order("first_name");
  if (error) throw error;
  const rows = campers ?? [];
  const [{ data: divisions }, { data: bunks }, { data: contacts }] = await Promise.all([
    supabase.from("divisions").select("id, name").eq("session_id", f.sessionId),
    supabase.from("bunks").select("id, name"),
    supabase.from("camper_contacts").select("camper_id, role, slot, name, phone, phone_e164, email, campers!inner(session_id)").eq("campers.session_id", f.sessionId),
  ]);
  const dName = new Map((divisions ?? []).map((d) => [d.id, d.name]));
  const bName = new Map((bunks ?? []).map((b) => [b.id, b.name]));
  const byCamper = new Map<string, ContactLike[]>();
  for (const c of contacts ?? []) {
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

export async function getCamper(supabase: DB, id: string): Promise<CamperRow | null> {
  const { data: c } = await supabase.from("campers_visible").select("*").eq("id", id).maybeSingle();
  if (!c) return null;
  const [{ data: division }, { data: bunk }, { data: contacts }] = await Promise.all([
    c.division_id ? supabase.from("divisions").select("name").eq("id", c.division_id).maybeSingle() : Promise.resolve({ data: null }),
    c.bunk_id ? supabase.from("bunks").select("name").eq("id", c.bunk_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("camper_contacts").select("role, slot, name, phone, phone_e164, email, source, id, can_pickup").eq("camper_id", id).order("role").order("slot"),
  ]);
  return { ...c, division_name: division?.name ?? null, bunk_name: bunk?.name ?? null, contacts: contacts ?? [] };
}
