"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { createAdminClient } from "@/lib/supabase/admin";
import { canCount, canStartCount, countDivisionIds, countMarks, loadCount, seesCount } from "@/lib/data/head-counts";
import { parseGroups, type CountMark } from "@/lib/head-counts";

const NOT_APPLIED = "Head counts need a database update first (migration 0048).";
const friendly = (e: unknown) => (/head_count/.test(errorMessage(e)) ? NOT_APPLIED : errorMessage(e));

const newCount = z.object({
  name: z.string().trim().min(1, "Give the count a name, like “Trip to the zoo”.").max(120),
  divisionIds: z.array(z.guid()).min(1, "Pick at least one division."),
  groups: z.string().max(2000).default(""),
});

/** Starts a head count for some divisions (and, for more than one bus, the buses). */
export async function createCount(fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  if (!canStartCount(me)) return fail("Head staff start head counts.");
  const parsed = newCount.safeParse({ name: fd.get("name"), divisionIds: fd.getAll("divisionIds").map(String), groups: fd.get("groups") ?? "" });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const allowed = countDivisionIds(me);
  if (allowed && parsed.data.divisionIds.some((d) => !allowed.includes(d))) return fail("You can start counts for your own divisions.");
  const session = await getActiveSession();
  if (!session) return fail("No active session.");
  try {
    const { data, error } = await createAdminClient()
      .from("head_counts")
      .insert({ session_id: session.id, name: parsed.data.name, division_ids: parsed.data.divisionIds, groups: parseGroups(parsed.data.groups), created_by: me.id, created_by_name: me.fullName })
      .select("id")
      .single();
    if (error) throw error;
    revalidatePath("/counts");
    return ok("Count started.", `/counts/${data.id}`);
  } catch (e) {
    return fail(friendly(e));
  }
}

type CountResult = { ok: true; marks: CountMark[]; message?: string } | { ok: false; error: string };

async function openCount(id: string) {
  const me = await requireUser();
  const count = await loadCount(id);
  if (!count || !seesCount(me, count.division_ids)) return { error: "This count isn't in your divisions." } as const;
  return { me, count } as const;
}

/** Counts a camper (scanned or tapped), on a bus: counted again on another bus moves them there. */
export async function markCamper(countId: string, camperId: string, group: string | null, method: "scan" | "manual"): Promise<CountResult> {
  // outside the try: an expired sign-in redirects to the login page (by throwing)
  const r = await openCount(countId);
  try {
    if ("error" in r) return { ok: false, error: r.error! };
    const { me, count } = r;
    if (!canCount(me)) return { ok: false, error: "Counting is for staff who can check kids in." };
    if (count.closed_at) return { ok: false, error: "This count is closed." };
    if (count.groups.length && (!group || !count.groups.includes(group))) return { ok: false, error: "Pick your bus first." };
    const admin = createAdminClient();
    const { data: c } = await admin.from("campers").select("division_id, archived_at").eq("id", camperId).maybeSingle();
    if (!c || c.archived_at || !c.division_id || !count.division_ids.includes(c.division_id)) return { ok: false, error: "This camper isn't in this count's divisions." };
    const { error } = await admin
      .from("head_count_marks")
      .upsert({ head_count_id: countId, camper_id: camperId, group_name: count.groups.length ? group : null, method, marked_by: me.id, marked_by_name: me.fullName, marked_at: new Date().toISOString() }, { onConflict: "head_count_id,camper_id" });
    if (error) throw error;
    return { ok: true, marks: await countMarks(countId) };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** Takes a camper off the count (counted by mistake). */
export async function unmarkCamper(countId: string, camperId: string): Promise<CountResult> {
  // outside the try: an expired sign-in redirects to the login page (by throwing)
  const r = await openCount(countId);
  try {
    if ("error" in r) return { ok: false, error: r.error! };
    if (!canCount(r.me)) return { ok: false, error: "Counting is for staff who can check kids in." };
    if (r.count.closed_at) return { ok: false, error: "This count is closed." };
    const { error } = await createAdminClient().from("head_count_marks").delete().eq("head_count_id", countId).eq("camper_id", camperId);
    if (error) throw error;
    return { ok: true, marks: await countMarks(countId) };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** Who's been counted so far (every few seconds, so each bus sees the others). */
export async function countState(countId: string): Promise<CountResult & { closed?: boolean }> {
  // outside the try: an expired sign-in redirects to the login page (by throwing)
  const r = await openCount(countId);
  try {
    if ("error" in r) return { ok: false, error: r.error! };
    return { ok: true, marks: await countMarks(countId), closed: Boolean(r.count.closed_at) };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

/** Closes a count (it's kept, read-only), or opens it again. */
export async function closeCount(countId: string, close: boolean): Promise<ActionResult> {
  // outside the try: an expired sign-in redirects to the login page (by throwing)
  const r = await openCount(countId);
  try {
    if ("error" in r) return fail(r.error!);
    if (!canStartCount(r.me)) return fail("Head staff close counts.");
    const { error } = await createAdminClient()
      .from("head_counts")
      .update(close ? { closed_at: new Date().toISOString(), closed_by_name: r.me.fullName } : { closed_at: null, closed_by_name: null })
      .eq("id", countId);
    if (error) throw error;
    revalidatePath("/counts");
    revalidatePath(`/counts/${countId}`);
    return ok(close ? "Count closed." : "Count opened again.");
  } catch (e) {
    return fail(friendly(e));
  }
}
