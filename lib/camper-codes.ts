import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { compareBunkNames } from "@/lib/bunk-order";

/** A camper code as typed or scanned: the short numbers (0012) and the long ones (100016). */
export const isCamperCode = (code: string) => /^\d{4,6}$/.test(code);

/**
 * The code a camper of the session has now for one read off a tag: the same, or, for a tag
 * printed before the short numbers, the short number of whoever had that long one.
 */
export async function currentCode(sessionId: string, code: string): Promise<string> {
  if (code.length < 6) return code;
  const admin = createAdminClient();
  const { data: now } = await admin.from("campers").select("id").eq("session_id", sessionId).eq("camper_code", code).maybeSingle();
  if (now) return code;
  // (no former_code column before migration 0037: then there are no short numbers either)
  const { data: was } = await admin.from("campers").select("camper_code").eq("session_id", sessionId).eq("former_code", code).maybeSingle();
  return was?.camper_code ?? code;
}

type Place = { name: string; sort_order: number | null } | null;

/** Printing order: division, bunk (Alef, Beis… / 1, 2… 10), last name, first name. */
export function byPlaceThenName(a: { first_name: string; last_name: string; divisions: unknown; bunks: unknown }, b: typeof a): number {
  const [da, db] = [a.divisions as Place, b.divisions as Place];
  const [ba, bb] = [a.bunks as Place, b.bunks as Place];
  return (
    (da?.sort_order ?? 9999) - (db?.sort_order ?? 9999) ||
    (da?.name ?? "").localeCompare(db?.name ?? "") ||
    (ba?.sort_order ?? 9999) - (bb?.sort_order ?? 9999) ||
    compareBunkNames(ba?.name ?? "", bb?.name ?? "") ||
    a.last_name.localeCompare(b.last_name) ||
    a.first_name.localeCompare(b.first_name)
  );
}

/** How many campers of the session still have a long number (100016…). */
export async function longCodeCount(sessionId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("campers")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .is("archived_at", null)
    .is("former_code", null)
    .like("camper_code", "______");
  // before migration 0037 there's nothing to offer
  return error ? 0 : (count ?? 0);
}

/**
 * Gives the session's campers that still have a long number short ones (0001…), in printing
 * order, after the highest short number so far. The long numbers are kept: their tags still
 * scan. Everyone with a short number keeps it.
 */
export async function shortenCodes(sessionId: string): Promise<{ given: number; first: string | null; last: string | null }> {
  const admin = createAdminClient();
  const { fetchAll } = await import("@/lib/supabase/fetch-all");
  const rows = await fetchAll((from, to) =>
    admin
      .from("campers")
      .select("id, first_name, last_name, camper_code, divisions(name, sort_order), bunks(name, sort_order)")
      .eq("session_id", sessionId)
      .is("archived_at", null)
      .is("former_code", null)
      .like("camper_code", "______")
      .order("id")
      .range(from, to),
  );
  if (!rows.length) return { given: 0, first: null, last: null };
  const ids = rows.sort(byPlaceThenName).map((r) => r.id);
  let given = 0;
  // in parts, each in order (a part is one call: its numbers follow on)
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await admin.rpc("renumber_camper_codes", { p_ids: ids.slice(i, i + 300) });
    if (error) throw error;
    given += data ?? 0;
  }
  const { data: ends } = await admin.from("campers").select("camper_code").in("id", [ids[0], ids[ids.length - 1]]);
  const codes = (ends ?? []).map((e) => e.camper_code).sort();
  return { given, first: codes[0] ?? null, last: codes[codes.length - 1] ?? null };
}
