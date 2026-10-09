import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { CAMP_TIME_ZONE } from "@/lib/utils";
import { DEFAULT_RULES, campClock, missingStates, type Followup, type MissingRules, type MissingState } from "@/lib/attendance/missing";
import type { BoardRow } from "./board";

type DB = SupabaseClient<Database>;

/** Whether anyone in the session has arrived yet (session-wide, whatever this person can see). */
export async function campStarted(sessionId: string): Promise<boolean> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { count } = await createAdminClient()
    .from("attendance_events")
    .select("id, campers!inner(session_id)", { count: "exact", head: true })
    .eq("campers.session_id", sessionId)
    .eq("event_type", "arrival");
  return (count ?? 0) > 0;
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
export function flagRows(rows: Pick<BoardRow, "id" | "divisionId" | "bunkId" | "status">[], rules: MissingRules, followups: Record<string, Followup>, started: boolean, now = new Date()): Record<string, MissingState> {
  return Object.fromEntries(missingStates(rows, rules, new Map(Object.entries(followups)), now, campClock(now, CAMP_TIME_ZONE), started));
}
