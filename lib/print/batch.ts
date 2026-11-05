import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { startOfCampDay } from "@/lib/time";
import { campDivisions, templateDivisionIds, templateSkipsDivisionIds } from "./template-camps";
export { startOfCampDay };

type DB = SupabaseClient<Database>;

export type BatchWhere = { divisionIds: string[] | null; divisionId?: string; bunkId?: string };
import { BATCH_WHICH_LABELS, type BatchWhichKey } from "./batch-labels";
export type BatchWhich = BatchWhichKey;
export const BATCH_WHICH = BATCH_WHICH_LABELS;

/** Campers (ids, in printing order) for a batch; the user's own access applies. */
export async function batchCamperIds(db: DB, sessionId: string, where: BatchWhere, which: BatchWhich, templateId: string): Promise<string[]> {
  return (await batchCampers(db, sessionId, where, which, templateId)).ids;
}

/**
 * batchCamperIds, and for "new or changed" which of them get this tag for the first time ("new":
 * a new package) and whose tag changed since printed ("updated": an existing one to find).
 */
export async function batchCampers(db: DB, sessionId: string, where: BatchWhere, which: BatchWhich, templateId: string): Promise<{ ids: string[]; kinds: Map<string, "new" | "updated"> | null }> {
  let kinds: Map<string, "new" | "updated"> | null = null;
  // a template for some camps only: just their campers
  const { data: tpl } = await db.from("print_templates").select("*").eq("id", templateId).maybeSingle();
  // (and no camp that gets name tags only, for anything but name tags: Settings)
  const campList = tpl ? await campDivisions(db, sessionId) : [];
  const only = tpl ? templateDivisionIds(tpl, campList) : null;
  const skip = tpl ? templateSkipsDivisionIds(tpl, campList) : [];
  if (only) where = { ...where, divisionIds: where.divisionIds ? where.divisionIds.filter((d) => only.includes(d)) : only };
  if (where.divisionIds && !where.divisionIds.length) return { ids: [], kinds };
  const rows = await fetchAll((from, to) => {
    let q = db.from("campers").select("id, status").eq("session_id", sessionId).is("archived_at", null);
    if (where.divisionIds) q = q.in("division_id", where.divisionIds);
    if (skip.length) q = q.or(`division_id.is.null,division_id.not.in.(${skip.join(",")})`);
    if (where.divisionId) q = q.eq("division_id", where.divisionId);
    if (where.bunkId) q = q.eq("bunk_id", where.bunkId);
    if (which === "present") q = q.eq("status", "present");
    return q.order("bunk_id").order("last_name").order("first_name").order("id").range(from, to);
  });
  let ids = rows.map((r) => r.id);
  if (which === "not_printed" && ids.length) {
    const printed = await fetchAll((from, to) =>
      db.from("print_job_items").select("camper_id, print_jobs!inner(template_id, status)").eq("print_jobs.template_id", templateId).neq("print_jobs.status", "cancelled").neq("print_jobs.status", "failed").order("camper_id").order("job_id").range(from, to),
    );
    const done = new Set(printed.map((p) => p.camper_id));
    ids = ids.filter((id) => !done.has(id));
  }
  if (which === "changed" && ids.length) {
    kinds = await camperTagKinds(templateId, ids);
    ids = ids.filter((id) => kinds!.has(id));
  }
  if (which === "arrived_today" && ids.length) {
    const arrivals = await fetchAll((from, to) =>
      db.from("attendance_events").select("camper_id").eq("event_type", "arrival").gte("occurred_at", startOfCampDay()).order("camper_id").order("id").range(from, to),
    );
    const today = new Set(arrivals.map((a) => a.camper_id));
    // an arrival that was undone (back to "not here yet") doesn't count
    const stillArrived = new Set(rows.filter((r) => r.status !== "expected" && r.status !== "no_show").map((r) => r.id));
    ids = ids.filter((id) => today.has(id) && stillArrived.has(id));
  }
  return { ids, kinds };
}

/**
 * Of these campers, whose tag on this template is new (never printed: a new package) and whose
 * changed since it was last printed (an existing one to find). Those whose last tag says the
 * same, and tags printed before Kinus kept fingerprints, aren't in it.
 */
export async function camperTagKinds(templateId: string, ids: string[]): Promise<Map<string, "new" | "updated">> {
  const [{ createAdminClient }, { changedSince }, { toSpec }] = await Promise.all([import("@/lib/supabase/admin"), import("./jobs"), import("./data")]);
  const admin = createAdminClient();
  // the latest printed copy of this label for each camper, and what it said
  const printed = await fetchAll((from, to) =>
    admin
      .from("print_job_items")
      .select("camper_id, content_hash, print_jobs!inner(template_id, status, requested_at)")
      .eq("print_jobs.template_id", templateId)
      .neq("print_jobs.status", "cancelled")
      .neq("print_jobs.status", "failed")
      .order("camper_id")
      .order("job_id")
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
  const { data: template } = await admin.from("print_templates").select("*").eq("id", templateId).single();
  const changed = template ? await changedSince(admin, toSpec(template), new Map(check.map((id) => [id, last.get(id)!.hash!]))) : new Set<string>();
  const kinds = new Map<string, "new" | "updated">();
  for (const id of ids) {
    if (!last.has(id)) kinds.set(id, "new");
    else if (changed.has(id)) kinds.set(id, "updated");
  }
  return kinds;
}
