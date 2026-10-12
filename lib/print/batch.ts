import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { startOfCampDay } from "@/lib/time";
export { startOfCampDay };

type DB = SupabaseClient<Database>;

export type BatchWhere = { divisionIds: string[] | null; divisionId?: string; bunkId?: string };
import { BATCH_WHICH_LABELS, type BatchWhichKey } from "./batch-labels";
export type BatchWhich = BatchWhichKey;
export const BATCH_WHICH = BATCH_WHICH_LABELS;

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
  if (which === "changed" && ids.length) {
    // the latest printed copy of this label for each camper, and what it said
    const printed = await fetchAll((from, to) =>
      db
        .from("print_job_items")
        .select("camper_id, content_hash, print_jobs!inner(template_id, status, requested_at)")
        .eq("print_jobs.template_id", templateId)
        .neq("print_jobs.status", "cancelled")
        .neq("print_jobs.status", "failed")
        .order("camper_id")
        .range(from, to),
    );
    const last = new Map<string, { at: string; hash: string | null }>();
    for (const p of printed) {
      const at = (p.print_jobs as unknown as { requested_at: string }).requested_at;
      const cur = last.get(p.camper_id);
      if (!cur || at > cur.at) last.set(p.camper_id, { at, hash: p.content_hash });
    }
    // labels printed before Kinus kept fingerprints count as unchanged
    const check = ids.filter((id) => last.get(id)?.hash);
    // read the same way the labels were made (every field, whatever this person may see)
    const [{ createAdminClient }, { labelHashes }, { toSpec }] = await Promise.all([import("@/lib/supabase/admin"), import("./jobs"), import("./data")]);
    const admin = createAdminClient();
    const { data: template } = await admin.from("print_templates").select("*").eq("id", templateId).single();
    const now = template && check.length ? await labelHashes(admin, toSpec(template), check) : new Map<string, string>();
    ids = ids.filter((id) => {
      const was = last.get(id);
      if (!was) return true;
      return Boolean(was.hash && now.has(id) && now.get(id) !== was.hash);
    });
  }
  if (which === "arrived_today" && ids.length) {
    const arrivals = await fetchAll((from, to) =>
      db.from("attendance_events").select("camper_id").eq("event_type", "arrival").gte("occurred_at", startOfCampDay()).order("camper_id").range(from, to),
    );
    const today = new Set(arrivals.map((a) => a.camper_id));
    // an arrival that was undone (back to "not here yet") doesn't count
    const stillArrived = new Set(rows.filter((r) => r.status !== "expected" && r.status !== "no_show").map((r) => r.id));
    ids = ids.filter((id) => today.has(id) && stillArrived.has(id));
  }
  return ids;
}
