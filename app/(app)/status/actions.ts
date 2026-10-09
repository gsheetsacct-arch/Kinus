"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { isDirector } from "@/lib/auth/permissions";
import { errorMessage } from "@/lib/actions/result";
import type { AttendanceEventType } from "@/lib/attendance/machine";
import type { BoardRow } from "@/lib/data/board";

export type BoardChange = Pick<BoardRow, "id" | "status" | "at" | "by" | "type" | "note">;

/** Check-ins since `since` (ISO), for live updates without reloading the whole board. */
export async function boardChanges(since: string): Promise<{ changes: BoardChange[]; now: string }> {
  await requireUser();
  const session = await getActiveSession();
  const now = new Date().toISOString();
  if (!session) return { changes: [], now };
  const supabase = await createClient();
  const { data } = await supabase
    .from("campers_board")
    .select("id, status, last_event_at, last_event_by, last_event_type, last_event_note")
    .eq("session_id", session.id)
    .gt("last_event_at", since)
    .limit(1000);
  return {
    now,
    changes: (data ?? []).map((c) => ({ id: c.id!, status: c.status!, at: c.last_event_at, by: c.last_event_by, type: c.last_event_type, note: c.last_event_note })),
  };
}

/** Directors: the same check-in for many campers (e.g. a whole bunk boarding the bus). */
export async function bulkAttendance(ids: string[], event: AttendanceEventType, note?: string): Promise<{ ok: true; done: number; skipped: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!isDirector(user)) return { ok: false, error: "Only directors can change many campers at once." };
  if (!ids.length) return { ok: false, error: "Select campers first." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_attendance", { p_camper_ids: ids.slice(0, 2000), p_event_type: event, p_note: note?.trim() || undefined });
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath("/status");
  const r = data as { done: number; skipped: number };
  return { ok: true, done: r.done, skipped: r.skipped };
}
