import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { sleepingOf } from "@/lib/sleeping";

/** Each camper's "Sleeping At The Kinus" answer (lib/sleeping): only those who answered. */
export async function sleepingAtKinus(sessionId: string, ids?: string[]): Promise<Map<string, boolean>> {
  const admin = createAdminClient();
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
