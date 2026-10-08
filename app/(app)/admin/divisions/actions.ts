"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

const division = z.object({
  id: z.string().uuid().optional(),
  session_id: z.string().uuid(),
  name: z.string().trim().min(1),
  language: z.enum(["he", "fr", "en"]),
  color: z.string().trim().optional(),
  sort_order: z.coerce.number().int().default(0),
});

export async function saveDivision(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const d = division.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    const row = { session_id: d.session_id, name: d.name, language: d.language, color: d.color || null, sort_order: d.sort_order };
    const { error } = d.id ? await supabase.from("divisions").update(row).eq("id", d.id) : await supabase.from("divisions").insert(row);
    if (error) throw error;
    revalidatePath("/admin/divisions");
    return ok(d.id ? "Division saved." : "Division created.");
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
  revalidatePath("/admin/divisions");
  return ok("Division deleted.");
}

const bunk = z.object({ id: z.string().uuid().optional(), division_id: z.string().uuid(), name: z.string().trim().min(1), sort_order: z.coerce.number().int().default(0) });

export async function saveBunk(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const d = bunk.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    const row = { division_id: d.division_id, name: d.name, sort_order: d.sort_order };
    const { error } = d.id ? await supabase.from("bunks").update(row).eq("id", d.id) : await supabase.from("bunks").insert(row);
    if (error) throw error;
    revalidatePath("/admin/divisions");
    return ok(d.id ? "Bunk saved." : "Bunk added.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** Deletes a bunk, moving its campers to another bunk (or unassigned). */
export async function deleteBunk(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(fd.get("id"));
  const moveTo = String(fd.get("move_to") ?? "");
  const supabase = await createClient();
  const mv = await supabase.from("campers").update({ bunk_id: moveTo || null }).eq("bunk_id", id);
  if (mv.error) return fail(mv.error.message);
  const { error } = await supabase.from("bunks").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/admin/divisions");
  return ok(moveTo ? "Bunk merged." : "Bunk deleted; its campers are unassigned.");
}
