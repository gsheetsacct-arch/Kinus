import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { CAMP_TIME_ZONE } from "@/lib/utils";
import { DEFAULT_RULES, campClock, missingStates, type CampStart, type Followup, type MissingRules, type MissingState } from "@/lib/attendance/missing";
import { campToday } from "@/lib/time";
import type { BoardRow } from "./board";

type DB = SupabaseClient<Database>;

/** Whether anyone in the session has arrived yet: no, today, or "earlier" (a previous camp day). Session-wide. */
export async function campStarted(sessionId: string): Promise<CampStart> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data } = await createAdminClient()
    .from("attendance_events")
    // two foreign keys link these tables (camper_id, and campers.last_event_id): name the one meant
    .select("occurred_at, campers!attendance_events_camper_id_fkey!inner(session_id)")
    .eq("campers.session_id", sessionId)
    .eq("event_type", "arrival")
    .order("occurred_at")
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  return campToday(new Date(data.occurred_at)) < campToday() ? "earlier" : true;
}

export async function loadRules(db: DB): Promise<MissingRules> {
  const { data } = await db.from("settings").select("value").eq("key", "missing_rules").maybeSingle();
  return { ...DEFAULT_RULES, ...((data?.value ?? {}) as Partial<MissingRules>) };
}

/** Follow-ups (coming later, notes) for a session's campers the user can see. */
export async function loadFollowups(db: DB, sessionId: string): Promise<Record<string, Followup>> {
  const rows = await fetchAll((from, to) =>
    db.from("camper_followups").select("camper_id, until, note, updated_at, profiles:updated_by(full_name), campers!inner(session_id)").eq("campers.session_id", sessionId).order("camper_id").range(from, to),
  );
  return Object.fromEntries(rows.map((f) => [f.camper_id, { until: f.until, note: f.note, at: f.updated_at, by: (f.profiles as { full_name: string } | null)?.full_name ?? null }]));
}

/** Flags for board rows, as a plain object (it crosses to the browser). */
export function flagRows(rows: Pick<BoardRow, "id" | "divisionId" | "bunkId" | "status">[], rules: MissingRules, followups: Record<string, Followup>, started: CampStart, now = new Date()): Record<string, MissingState> {
  return Object.fromEntries(missingStates(rows, rules, new Map(Object.entries(followups)), now, campClock(now, CAMP_TIME_ZONE), started));
}
