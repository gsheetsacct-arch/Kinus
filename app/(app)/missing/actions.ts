"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/current-user";
import { errorMessage } from "@/lib/actions/result";

type Result = { ok: true; message: string } | { ok: false; error: string };
const friendly = (e: unknown) => {
  const m = errorMessage(e);
  if (/not allowed|row-level security|42501/i.test(m)) return "This camper isn't in your area.";
  if (/invalid transition/i.test(m)) return "Someone just changed this camper. Refresh to see where they are.";
  return m;
};
const done = (message: string): Result => {
  revalidatePath("/missing");
  revalidatePath("/status");
  return { ok: true, message };
};

/** Coming later (pauses the check-up flag until `until`) and/or a note like "called mom". */
export async function saveFollowup(camperId: string, f: { until?: string | null; note?: string | null }): Promise<Result> {
  const me = await requireUser();
  const supabase = await createClient();
  const row: { camper_id: string; updated_at: string; until?: string | null; note?: string | null } = { camper_id: camperId, updated_at: new Date().toISOString() };
  if (f.until !== undefined) row.until = f.until;
  if (f.note !== undefined) row.note = f.note?.trim() || null;
  const { error } = await supabase.from("camper_followups").upsert({ ...row, updated_by: me.id }, { onConflict: "camper_id" });
  if (error) return { ok: false, error: friendly(error) };
  return done(f.until ? "Flag paused until then." : "Saved.");
}

export async function clearFollowup(camperId: string): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("camper_followups").delete().eq("camper_id", camperId);
  if (error) return { ok: false, error: friendly(error) };
  return done("Cleared.");
}

/** Not coming: marks a no-show, with the reason in their timeline. */
export async function markNotComing(camperId: string, reason: string): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_attendance", { p_camper_id: camperId, p_event_type: "no_show", p_method: "manual", p_note: reason.trim() || "Not coming" });
  if (error) return { ok: false, error: friendly(error) };
  await supabase.from("camper_followups").delete().eq("camper_id", camperId);
  return done("Marked not coming.");
}

/** Coming after all: back to "not here yet". */
export async function undoNotComing(camperId: string): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_attendance", { p_camper_id: camperId, p_event_type: "correction", p_method: "manual", p_note: "Coming after all", p_force_status: "expected" });
  if (error) return { ok: false, error: friendly(error) };
  return done("Back on the not-here-yet list.");
}

/** Arrived: checks them in and clears the follow-up. */
export async function checkInNow(camperId: string): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_attendance", { p_camper_id: camperId, p_event_type: "arrival", p_method: "manual" });
  if (error) return { ok: false, error: friendly(error) };
  await supabase.from("camper_followups").delete().eq("camper_id", camperId);
  return done("Checked in.");
}
