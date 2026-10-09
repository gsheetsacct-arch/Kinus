import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { CAMP_TIME_ZONE } from "@/lib/utils";

type DB = SupabaseClient<Database>;

export type BatchWhere = { divisionIds: string[] | null; divisionId?: string; bunkId?: string };
import { BATCH_WHICH_LABELS, type BatchWhichKey } from "./batch-labels";
export type BatchWhich = BatchWhichKey;
export const BATCH_WHICH = BATCH_WHICH_LABELS;

/** Start of today in camp's time zone, as an ISO instant. */
export function startOfCampDay(now = new Date()): string {
  const day = now.toLocaleDateString("en-CA", { timeZone: CAMP_TIME_ZONE }); // YYYY-MM-DD
  // the zone's offset at that moment, e.g. "GMT-4"
  const off = new Intl.DateTimeFormat("en-US", { timeZone: CAMP_TIME_ZONE, timeZoneName: "shortOffset" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(off);
  const sign = m && m[1].startsWith("-") ? "-" : "+";
  const hh = m ? String(Math.abs(Number(m[1]))).padStart(2, "0") : "00";
  return new Date(`${day}T00:00:00${sign}${hh}:${m?.[2] ?? "00"}`).toISOString();
}

/** Campers (ids, in printing order) for a batch; the user's own access applies. */
export async function batchCamperIds(db: DB, sessionId: string, where: BatchWhere, which: BatchWhich, templateId: string): Promise<string[]> {
  if (where.divisionIds && !where.divisionIds.length) return [];
  const rows = await fetchAll((from, to) => {
    let q = db.from("campers").select("id, status").eq("session_id", sessionId).is("archived_at", null);
    if (where.divisionIds) q = q.in("division_id", where.divisionIds);
    if (where.divisionId) q = q.eq("division_id", where.divisionId);
    if (where.bunkId) q = q.eq("bunk_id", where.bunkId);
    if (which === "present") q = q.eq("status", "present");
    return q.order("bunk_id").order("last_name").order("first_name").order("id").range(from, to);
  });
  let ids = rows.map((r) => r.id);
  if (which === "not_printed" && ids.length) {
    const printed = await fetchAll((from, to) =>
      db.from("print_job_items").select("camper_id, print_jobs!inner(template_id, status)").eq("print_jobs.template_id", templateId).neq("print_jobs.status", "cancelled").neq("print_jobs.status", "failed").order("camper_id").range(from, to),
    );
    const done = new Set(printed.map((p) => p.camper_id));
    ids = ids.filter((id) => !done.has(id));
  }
  if (which === "arrived_today" && ids.length) {
    const arrivals = await fetchAll((from, to) =>
      db.from("attendance_events").select("camper_id").eq("event_type", "arrival").gte("occurred_at", startOfCampDay()).order("camper_id").range(from, to),
    );
    const today = new Set(arrivals.map((a) => a.camper_id));
    ids = ids.filter((id) => today.has(id));
  }
  return ids;
}
