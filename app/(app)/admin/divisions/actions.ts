"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireAdmin } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { fetchAll } from "@/lib/supabase/fetch-all";

const done = (msg: string, redirect?: string) => {
  revalidatePath("/", "layout");
  return ok(msg, redirect);
};

const division = z.object({
  id: z.guid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Give the division a name."),
  language: z.enum(["he", "fr", "en"]),
  color: z.string().trim().optional(),
});

export async function saveDivision(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const session = await getActiveSession();
  if (!session) return fail("Activate a session first.");
  try {
    const d = division.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    const row = { name: d.name, language: d.language, color: d.color || null };
    if (d.id) {
      const { error } = await supabase.from("divisions").update(row).eq("id", d.id);
      if (error) throw error;
      return done("Division saved.");
    }
    const { count } = await supabase.from("divisions").select("id", { count: "exact", head: true }).eq("session_id", session.id);
    const { data, error } = await supabase.from("divisions").insert({ ...row, session_id: session.id, sort_order: (count ?? 0) + 1 }).select("id").single();
    if (error) throw error;
    return done("Division added.", `/admin/divisions?d=${data.id}`);
  } catch (e) {
    return fail(/duplicate/.test(errorMessage(e)) ? "A division with that name already exists." : errorMessage(e));
  }
}

/** Swaps an item with its neighbour, renumbering the whole list so the order is always clean. */
async function reorder(table: "divisions" | "bunks", siblings: { id: string; sort_order: number }[], id: string, dir: "up" | "down") {
  const supabase = await createClient();
  const list = siblings.map((s) => s.id);
  const i = list.indexOf(id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  for (let k = 0; k < list.length; k++) {
    if (siblings.find((s) => s.id === list[k])!.sort_order !== k + 1) {
      const { error } = await supabase.from(table).update({ sort_order: k + 1 }).eq("id", list[k]);
      if (error) throw error;
    }
  }
}

async function move(table: "divisions" | "bunks", id: string, dir: "up" | "down") {
  const supabase = await createClient();
  if (table === "divisions") {
    const { data: self } = await supabase.from("divisions").select("session_id").eq("id", id).single();
    if (!self) throw new Error("Not found.");
    const { data } = await supabase.from("divisions").select("id, sort_order").eq("session_id", self.session_id).order("sort_order").order("name");
    return reorder(table, data ?? [], id, dir);
  }
  const { data: self } = await supabase.from("bunks").select("division_id").eq("id", id).single();
  if (!self) throw new Error("Not found.");
  const { data } = await supabase.from("bunks").select("id, sort_order").eq("division_id", self.division_id).order("sort_order").order("name");
  return reorder(table, data ?? [], id, dir);
}

export async function moveDivision(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    await move("divisions", String(fd.get("id")), fd.get("dir") === "up" ? "up" : "down");
    return done("");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function moveBunk(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    await move("bunks", String(fd.get("id")), fd.get("dir") === "up" ? "up" : "down");
    return done("");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function deleteDivision(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const { count } = await supabase.from("campers").select("id", { count: "exact", head: true }).eq("division_id", id);
  if (count) return fail(`This division still has ${count} campers. Move them first.`);
  const { error } = await supabase.from("divisions").delete().eq("id", id);
  if (error) return fail(error.message);
  return done("Division deleted.", "/admin/divisions");
}

const bunk = z.object({ id: z.guid().optional().or(z.literal("")), division_id: z.guid(), name: z.string().trim().min(1, "Give the bunk a name.") });

export async function saveBunk(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const d = bunk.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    if (d.id) {
      const { error } = await supabase.from("bunks").update({ name: d.name }).eq("id", d.id);
      if (error) throw error;
      return done("Bunk renamed.");
    }
    const { count } = await supabase.from("bunks").select("id", { count: "exact", head: true }).eq("division_id", d.division_id);
    const { error } = await supabase.from("bunks").insert({ division_id: d.division_id, name: d.name, sort_order: (count ?? 0) + 1 });
    if (error) throw error;
    return done(`Bunk "${d.name}" added.`);
  } catch (e) {
    return fail(/duplicate/.test(errorMessage(e)) ? "This division already has a bunk with that name." : errorMessage(e));
  }
}

/** Moves every camper (and staff access) from one bunk into another, then removes the empty bunk. */
export async function mergeBunk(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const from = String(fd.get("id"));
  const into = String(fd.get("into") ?? "");
  if (!into || into === from) return fail("Choose the bunk to merge into.");
  const supabase = await createClient();
  try {
    const { data: target } = await supabase.from("bunks").select("division_id, name").eq("id", into).single();
    if (!target) return fail("Bunk not found.");
    const mv = await supabase.from("campers").update({ bunk_id: into, division_id: target.division_id }).eq("bunk_id", from);
    if (mv.error) throw mv.error;
    const { data: scopes } = await supabase.from("staff_scopes").select("id, user_id").eq("bunk_id", from);
    for (const s of scopes ?? []) {
      const { data: dup } = await supabase.from("staff_scopes").select("id").eq("user_id", s.user_id).eq("bunk_id", into).maybeSingle();
      if (dup) await supabase.from("staff_scopes").delete().eq("id", s.id);
      else await supabase.from("staff_scopes").update({ bunk_id: into, division_id: target.division_id }).eq("id", s.id);
    }
    const { error } = await supabase.from("bunks").delete().eq("id", from);
    if (error) throw error;
    return done(`Merged into ${target.name}.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function deleteBunk(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const mv = await supabase.from("campers").update({ bunk_id: null }).eq("bunk_id", id);
  if (mv.error) return fail(mv.error.message);
  const { error } = await supabase.from("bunks").delete().eq("id", id);
  if (error) return fail(error.message);
  return done("Bunk deleted.");
}

/** Removes divisions and bunks in the active session that have no campers and no staff access. */
export async function removeEmpty(): Promise<ActionResult> {
  await requireAdmin();
  const session = await getActiveSession();
  if (!session) return fail("No active session.");
  const supabase = await createClient();
  const [{ data: divisions }, campers, { data: scopes }] = await Promise.all([
    supabase.from("divisions").select("id, bunks(id)").eq("session_id", session.id),
    fetchAll((from, to) => supabase.from("campers").select("division_id, bunk_id").eq("session_id", session.id).order("id").range(from, to)),
    supabase.from("staff_scopes").select("division_id, bunk_id"),
  ]);
  const usedBunks = new Set([...campers.map((c) => c.bunk_id), ...(scopes ?? []).map((s) => s.bunk_id)].filter(Boolean));
  const usedDivs = new Set([...campers.map((c) => c.division_id), ...(scopes ?? []).map((s) => s.division_id)].filter(Boolean));
  const bunkIds = (divisions ?? []).flatMap((d) => (d.bunks as { id: string }[]).map((b) => b.id)).filter((id) => !usedBunks.has(id));
  if (bunkIds.length) {
    const { error } = await supabase.from("bunks").delete().in("id", bunkIds);
    if (error) return fail(error.message);
  }
  const divIds = (divisions ?? []).filter((d) => !usedDivs.has(d.id) && (d.bunks as { id: string }[]).every((b) => bunkIds.includes(b.id))).map((d) => d.id);
  if (divIds.length) {
    const { error } = await supabase.from("divisions").delete().in("id", divIds);
    if (error) return fail(error.message);
  }
  return done(`Removed ${divIds.length} empty ${divIds.length === 1 ? "division" : "divisions"} and ${bunkIds.length} empty ${bunkIds.length === 1 ? "bunk" : "bunks"}.`, "/admin/divisions");
}
