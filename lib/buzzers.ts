import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { compareBunkNames } from "@/lib/bunk-order";
import { formatBuzzer } from "@/lib/buzzer-format";

export { formatBuzzer };

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

/**
 * Buzzer (pager) numbers: one per camper for the session, 001 and up, kept on the camper
 * (campers.current_buzzer_number) so anyone can look a name up and see the number. Given in
 * printing order (division, bunk, name), each new one after the highest so far: a sheet of
 * stickers comes out in number order, and nobody's number changes once given.
 * `redo`: everyone is numbered again from 001 in that order, also those who had a number
 * (their buzzer labels then need printing again).
 */
export async function assignBuzzers(sessionId: string, camperIds?: string[], opts: { redo?: boolean } = {}): Promise<{ given: number; first: number | null; last: number | null }> {
  const admin = createAdminClient();
  const { fetchAll } = await import("@/lib/supabase/fetch-all");
  const rows = await fetchAll((from, to) =>
    admin
      .from("campers")
      .select("id, first_name, last_name, current_buzzer_number, divisions(name, sort_order), bunks(name, sort_order)")
      .eq("session_id", sessionId)
      .is("archived_at", null)
      .order("id")
      .range(from, to),
  );
  const wanted = camperIds ? new Set(camperIds) : null;
  const redo = Boolean(opts.redo);
  // numbering a few again from 001 would give them numbers others have
  if (redo && camperIds) throw new Error("Renumbering is for everyone at once.");
  let next = redo ? 1 : rows.reduce((n, c) => Math.max(n, c.current_buzzer_number ?? 0), 0) + 1;
  const todo = rows.filter((c) => (redo || c.current_buzzer_number === null) && (!wanted || wanted.has(c.id))).sort(byPlaceThenName);
  if (!todo.length) return { given: 0, first: null, last: null };
  const first = next;
  // renumbering: only those whose number changes are written
  const plan = todo.map((c) => ({ id: c.id, n: next++, had: c.current_buzzer_number })).filter((p) => p.n !== p.had);
  for (let i = 0; i < plan.length; i += 25) {
    const results = await Promise.all(
      plan.slice(i, i + 25).map(({ id, n }) => {
        const q = admin.from("campers").update({ current_buzzer_number: n }).eq("id", id);
        return redo ? q : q.is("current_buzzer_number", null);
      }),
    );
    for (const { error } of results) if (error) throw error;
  }
  return { given: redo ? todo.length : plan.length, first, last: next - 1 };
}

/** Sets or clears one camper's number (a lost or broken buzzer); refuses one another camper has. */
export async function setBuzzer(camperId: string, number: number | null): Promise<void> {
  const admin = createAdminClient();
  const { data: c } = await admin.from("campers").select("session_id").eq("id", camperId).maybeSingle();
  if (!c) throw new Error("That camper is gone.");
  if (number !== null) {
    if (!Number.isInteger(number) || number < 1 || number > 99999) throw new Error("A buzzer number is a whole number from 1.");
    const { data: other } = await admin
      .from("campers")
      .select("first_name, last_name")
      .eq("session_id", c.session_id)
      .eq("current_buzzer_number", number)
      .is("archived_at", null)
      .neq("id", camperId)
      .maybeSingle();
    if (other) throw new Error(`Buzzer ${formatBuzzer(number)} is ${other.first_name} ${other.last_name}'s. Take it off them first.`);
  }
  const { error } = await admin.from("campers").update({ current_buzzer_number: number }).eq("id", camperId);
  if (error) throw error;
}

/** How many campers of the session have a number, and how many don't yet. */
export async function buzzerCounts(sessionId: string): Promise<{ with: number; without: number; highest: number | null }> {
  const admin = createAdminClient();
  const [{ count: all }, { count: without }, { data: top }] = await Promise.all([
    admin.from("campers").select("id", { count: "exact", head: true }).eq("session_id", sessionId).is("archived_at", null),
    admin.from("campers").select("id", { count: "exact", head: true }).eq("session_id", sessionId).is("archived_at", null).is("current_buzzer_number", null),
    admin.from("campers").select("current_buzzer_number").eq("session_id", sessionId).not("current_buzzer_number", "is", null).order("current_buzzer_number", { ascending: false }).limit(1),
  ]);
  return { with: (all ?? 0) - (without ?? 0), without: without ?? 0, highest: top?.[0]?.current_buzzer_number ?? null };
}
