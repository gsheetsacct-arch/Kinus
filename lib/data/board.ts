import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AttendanceEventType, CamperStatus } from "@/lib/attendance/machine";
import { fetchAll } from "@/lib/supabase/fetch-all";

type DB = SupabaseClient<Database>;

export type BoardPhone = { label: string; phone: string; tel: string };
export type BoardRow = {
  id: string;
  name: string;
  first: string;
  last: string;
  code: string;
  divisionId: string | null;
  bunkId: string | null;
  status: CamperStatus;
  at: string | null;
  by: string | null;
  type: AttendanceEventType | null;
  note: string | null;
  medical: boolean;
  phones: BoardPhone[];
};

const PARENT_LABEL: Record<string, string> = { mother: "Mom", father: "Dad", guardian: "Guardian" };

/** Every camper the user can see in the session, with their last check-in and parent phones (when allowed). */
export async function loadBoard(supabase: DB, sessionId: string, withPhones: boolean, divisionIds: string[] | null = null): Promise<BoardRow[]> {
  if (divisionIds && !divisionIds.length) return [];
  const [rows, contacts] = await Promise.all([
    fetchAll((from, to) => {
      let q = supabase
        .from("campers_board")
        .select("id, display_name, first_name, last_name, camper_code, division_id, bunk_id, status, last_event_at, last_event_by, last_event_type, last_event_note, has_medical_flag")
        .eq("session_id", sessionId)
        .is("archived_at", null);
      if (divisionIds) q = q.in("division_id", divisionIds);
      return q.order("id").range(from, to);
    }),
    withPhones
      ? fetchAll((from, to) => {
          let q = supabase
            .from("camper_contacts")
            .select("camper_id, role, slot, phone, phone_e164, campers!inner(session_id, division_id)")
            .eq("campers.session_id", sessionId)
            .in("role", ["mother", "father", "guardian"]);
          if (divisionIds) q = q.in("campers.division_id", divisionIds);
          return q.order("id").range(from, to);
        })
      : Promise.resolve([]),
  ]);
  const phones = new Map<string, (BoardPhone & { order: number })[]>();
  for (const k of contacts) {
    if (!k.phone) continue;
    const list = phones.get(k.camper_id) ?? [];
    list.push({ label: PARENT_LABEL[k.role] ?? k.role, phone: k.phone, tel: k.phone_e164 ?? k.phone, order: ["mother", "father", "guardian"].indexOf(k.role) * 10 + k.slot });
    phones.set(k.camper_id, list);
  }
  return rows.map((c) => ({
    id: c.id!,
    name: c.display_name ?? `${c.first_name} ${c.last_name}`,
    first: c.first_name ?? "",
    last: c.last_name ?? "",
    code: c.camper_code ?? "",
    divisionId: c.division_id,
    bunkId: c.bunk_id,
    status: c.status!,
    at: c.last_event_at,
    by: c.last_event_by,
    type: c.last_event_type,
    note: c.last_event_note,
    medical: Boolean(c.has_medical_flag),
    phones: (phones.get(c.id!) ?? []).sort((a, b) => a.order - b.order).map(({ label, phone, tel }) => ({ label, phone, tel })),
  }));
}
