import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { sleepingAnswer, sleepingOf } from "@/lib/sleeping";

/** Each camper's "Sleeping At The Kinus" answer (lib/sleeping): only those who answered. */
export async function sleepingAtKinus(sessionId: string, ids?: string[]): Promise<Map<string, boolean>> {
  const admin = createAdminClient();
  // just the answers, from the database (migration 0050), not every camper's whole export row
  const fast = await fetchAll((from, to) =>
    (admin.rpc.bind(admin) as unknown as (f: string, a: object) => { order: (c: string) => { range: (a: number, b: number) => PromiseLike<{ data: { camper_id: string; answer: string | null }[] | null; error: unknown }> } })("camper_sleeping_answers", { p_session_id: sessionId })
      .order("camper_id")
      .range(from, to),
  ).catch(() => null);
  if (fast) {
    const wanted = ids ? new Set(ids) : null;
    const out = new Map<string, boolean>();
    for (const r of fast) {
      if (wanted && !wanted.has(r.camper_id)) continue;
      const v = sleepingAnswer(r.answer);
      if (v !== null) out.set(r.camper_id, v);
    }
    return out;
  }
  // before migration 0050
  const rows = await fetchAll((from, to) => {
    // "*": source_fixes too (works before migration 0034, without them)
    let q = admin.from("campers").select("*").eq("session_id", sessionId).is("archived_at", null);
    if (ids && ids.length <= 300) q = q.in("id", ids);
    return q.order("id").range(from, to);
  });
  const out = new Map<string, boolean>();
  const wanted = ids ? new Set(ids) : null;
  for (const r of rows) {
    if (wanted && !wanted.has(r.id)) continue;
    const v = sleepingOf(r.source_data, (r as { source_fixes?: unknown }).source_fixes);
    if (v !== null) out.set(r.id, v);
  }
  return out;
}
