"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { isDirector } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/actions/result";
import type { AttendanceEventType } from "@/lib/attendance/machine";
import type { BoardRow } from "@/lib/data/board";

export type BoardChange = Pick<BoardRow, "id" | "status" | "at" | "by" | "type" | "note">;

/** Check-ins since `since` (ISO), for live updates without reloading the whole board. */
export async function boardChanges(since: string): Promise<{ changes: BoardChange[]; now: string; cursor: string }> {
  await requireUser();
  const session = await getActiveSession();
  const now = new Date().toISOString();
  // the next poll looks a minute back: a check-in's time is when its transaction began, so
  // one that commits slowly would otherwise fall behind the cursor and never show up
  const cursor = new Date(Date.now() - 60000).toISOString();
  if (!session) return { changes: [], now, cursor };
  const supabase = await createClient();
  // a busy minute (a whole bus at once) can pass the 1,000-row cap, so page through
  const data = await fetchAll((from, to) =>
    supabase
      .from("campers_board")
      .select("id, status, last_event_at, last_event_by, last_event_type, last_event_note")
      .eq("session_id", session.id)
      .gt("last_event_at", since)
      .order("last_event_at")
      .order("id")
      .range(from, to),
  ).catch(() => []);
  return {
    now,
    cursor,
    changes: data.map((c) => ({ id: c.id!, status: c.status!, at: c.last_event_at, by: c.last_event_by, type: c.last_event_type, note: c.last_event_note })),
  };
}

/** Directors: the same check-in for many campers (e.g. a whole bunk boarding the bus). */
export async function bulkAttendance(ids: string[], event: AttendanceEventType, note?: string): Promise<{ ok: true; done: number; skipped: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!isDirector(user)) return { ok: false, error: "Only directors can change many campers at once." };
  if (!ids.length) return { ok: false, error: "Select campers first." };
  const supabase = await createClient();
  // in chunks the function accepts, so a whole camp at once still goes through
  let done = 0;
  let skipped = 0;
  for (let i = 0; i < ids.length; i += 2000) {
    const { data, error } = await supabase.rpc("bulk_attendance", { p_camper_ids: ids.slice(i, i + 2000), p_event_type: event, p_note: note?.trim() || undefined });
    if (error) {
      if (done) revalidatePath("/status");
      return { ok: false, error: done ? `${done} done, then: ${errorMessage(error)}` : errorMessage(error) };
    }
    const r = data as { done: number; skipped: number };
    done += r.done;
    skipped += r.skipped;
  }
  revalidatePath("/status");
  return { ok: true, done, skipped };
}
