import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { compareBunkNames, compareDivisionNames, inNaturalOrder, usesHebrewLetters } from "@/lib/bunk-order";

type DB = SupabaseClient<Database>;
type Bunk = { id: string; name: string; sort_order: number; division_id: string };

/** Every bunk of the session, per division, in its current order. */
export async function bunkOrders(db: DB, sessionId: string): Promise<Map<string, Bunk[]>> {
  const { data, error } = await db.from("bunks").select("id, name, sort_order, division_id, divisions!inner(session_id)").eq("divisions.session_id", sessionId).order("sort_order").order("name");
  if (error) throw error;
  const out = new Map<string, Bunk[]>();
  for (const b of data ?? []) {
    const list = out.get(b.division_id) ?? [];
    list.push({ id: b.id, name: b.name, sort_order: b.sort_order, division_id: b.division_id });
    out.set(b.division_id, list);
  }
  return out;
}

/** Renumbers a division's bunks into Alef-Beis order. Returns how many moved. */
export async function putInOrder(db: DB, bunks: Bunk[]): Promise<number> {
  const sorted = [...bunks].sort((a, b) => compareBunkNames(a.name, b.name));
  const changes = sorted.map((b, i) => ({ id: b.id, from: b.sort_order, to: i + 1 })).filter((c) => c.from !== c.to);
  const results = await Promise.all(changes.map((c) => db.from("bunks").update({ sort_order: c.to }).eq("id", c.id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
  return changes.length;
}

/**
 * After bunks were added (an import, or by hand): a division of Hebrew-letter bunks that
 * was already in Alef-Beis order gets the new ones slotted into place. One someone ordered by hand keeps
 * its order, with the new bunks at the end.
 */
export async function slotNewBunks(db: DB, sessionId: string, before: Map<string, Bunk[]>): Promise<void> {
  const after = await bunkOrders(db, sessionId);
  for (const [divisionId, bunks] of after) {
    const old = before.get(divisionId) ?? [];
    if (bunks.length === old.length) continue;
    if (usesHebrewLetters(bunks.map((b) => b.name)) && inNaturalOrder(old.map((b) => b.name))) await putInOrder(db, bunks);
  }
}

type Division = { id: string; name: string; sort_order: number };

export async function divisionOrder(db: DB, sessionId: string): Promise<Division[]> {
  const { data, error } = await db.from("divisions").select("id, name, sort_order").eq("session_id", sessionId).order("sort_order").order("name");
  if (error) throw error;
  return data ?? [];
}

/** Renumbers the divisions: Division 1, 2, 3 … then the rest A–Z. Returns how many moved. */
export async function putDivisionsInOrder(db: DB, divisions: Division[]): Promise<number> {
  const sorted = [...divisions].sort((a, b) => compareDivisionNames(a.name, b.name));
  const changes = sorted.map((d, i) => ({ id: d.id, from: d.sort_order, to: i + 1 })).filter((c) => c.from !== c.to);
  const results = await Promise.all(changes.map((c) => db.from("divisions").update({ sort_order: c.to }).eq("id", c.id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
  return changes.length;
}

/** After divisions were added: in order if they were in order before (one ordered by hand stays as it was). */
export async function slotNewDivisions(db: DB, sessionId: string, before: Division[]): Promise<void> {
  const after = await divisionOrder(db, sessionId);
  if (after.length === before.length) return;
  const names = before.map((d) => d.name);
  if (names.every((n, i) => i === 0 || compareDivisionNames(names[i - 1], n) <= 0)) await putDivisionsInOrder(db, after);
}
