import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { byBunkThenName } from "@/lib/print/data";
import { formatBuzzer } from "@/lib/buzzer-format";
import { THURSDAY_PREFIX } from "@/lib/import/thursday";
import { campDivisions } from "@/lib/print/template-camps";

export { formatBuzzer };

type Place = { name: string } | null;

/**
 * Numbering order, the same as printing by bunk (lib/print/data byBunkThenName): division by
 * name (Division 1, 2, 3 … then the rest A–Z: Bar Mitzvah, French, Hebrew), bunk in Alef-Beis /
 * number order, then last name, first name; no division or bunk last. Not the order set by
 * hand on Divisions & bunks, so the numbers follow the names whatever that order is.
 */
export function byPlaceThenName(a: { first_name: string; last_name: string; divisions: unknown; bunks: unknown }, b: typeof a): number {
  const place = (c: typeof a) => ({ first_name: c.first_name, last_name: c.last_name, division_name: (c.divisions as Place)?.name ?? null, bunk_name: (c.bunks as Place)?.name ?? null });
  return byBunkThenName(place(a), place(b));
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
      .select("id, first_name, last_name, current_buzzer_number, source_id, division_id, divisions(name), bunks(name)")
      .eq("session_id", sessionId)
      .is("archived_at", null)
      .order("id")
      .range(from, to),
  );
  // the Thursday Program's second records (lib/import/thursday) get no buzzer: the camper has
  // theirs on their regular record; nor do camps that get name tags only (Settings: Thursday,
  // Virtual). Any they were given before are taken off
  const noBuzzer = await withoutBuzzers(sessionId);
  const thursday = rows.filter(noBuzzer);
  const numbered = thursday.filter((c) => c.current_buzzer_number !== null).map((c) => c.id);
  for (let i = 0; i < numbered.length; i += 200) {
    const { error } = await admin.from("campers").update({ current_buzzer_number: null }).in("id", numbered.slice(i, i + 200));
    if (error) throw error;
  }
  rows.splice(0, rows.length, ...rows.filter((c) => !noBuzzer(c)));
  const wanted = camperIds ? new Set(camperIds) : null;
  const redo = Boolean(opts.redo);
  // numbering a few again from 001 would give them numbers others have
  if (redo && camperIds) throw new Error("Renumbering is for everyone at once.");
  if (redo) {
    // archived campers give their numbers up: the numbers start again from 001, and one who comes
    // back later (an import brings them back) then gets a new number at the end, not someone else's
    const { error } = await admin.from("campers").update({ current_buzzer_number: null }).eq("session_id", sessionId).not("archived_at", "is", null).not("current_buzzer_number", "is", null);
    if (error) throw error;
  }
  // new numbers come after every number given this session (archived campers' too: their buzzer
  // labels may be printed), so a new one is never a number someone already has
  const { data: top } = redo
    ? { data: null }
    : await admin.from("campers").select("current_buzzer_number").eq("session_id", sessionId).not("current_buzzer_number", "is", null).order("current_buzzer_number", { ascending: false }).limit(1);
  let next = redo ? 1 : Math.max(top?.[0]?.current_buzzer_number ?? 0, rows.reduce((n, c) => Math.max(n, c.current_buzzer_number ?? 0), 0)) + 1;
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
      .limit(1)
      .maybeSingle();
    if (other) throw new Error(`Buzzer ${formatBuzzer(number)} is ${other.first_name} ${other.last_name}'s. Take it off them first.`);
  }
  const { error } = await admin.from("campers").update({ current_buzzer_number: number }).eq("id", camperId);
  if (error) throw error;
}

/** A Thursday Program record ("thursday:1234"): no buzzer of its own. */
const isThursdayRecord = (c: { source_id: string | null }) => Boolean(c.source_id?.startsWith(THURSDAY_PREFIX));

/** Who gets no buzzer: Thursday Program records, and campers of camps that get name tags only (Settings). */
async function withoutBuzzers(sessionId: string): Promise<(c: { source_id: string | null; division_id: string | null }) => boolean> {
  const skip = new Set((await campDivisions(createAdminClient(), sessionId)).filter((c) => c.nameTagsOnly).flatMap((c) => c.divisionIds));
  return (c) => isThursdayRecord(c) || Boolean(c.division_id && skip.has(c.division_id));
}

/** How many campers of the session have a number, and how many don't yet (those who get none aside). */
export async function buzzerCounts(sessionId: string): Promise<{ with: number; without: number; highest: number | null }> {
  const admin = createAdminClient();
  const { fetchAll } = await import("@/lib/supabase/fetch-all");
  const [rows, noBuzzer] = await Promise.all([
    fetchAll((from, to) => admin.from("campers").select("id, source_id, division_id, current_buzzer_number").eq("session_id", sessionId).is("archived_at", null).order("id").range(from, to)),
    withoutBuzzers(sessionId),
  ]);
  const counted = rows.filter((c) => !noBuzzer(c));
  const withNumber = counted.filter((c) => c.current_buzzer_number !== null);
  return { with: withNumber.length, without: counted.length - withNumber.length, highest: withNumber.reduce<number | null>((n, c) => Math.max(n ?? 0, c.current_buzzer_number!), null) };
}
