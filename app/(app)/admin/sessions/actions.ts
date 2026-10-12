"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

const schema = z.object({
  id: z.guid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Give the session a name."),
  starts_on: z.string().optional(),
  ends_on: z.string().optional(),
  activate: z.enum(["on"]).optional(),
  copy_from: z.guid().optional().or(z.literal("")),
  copy_staff: z.enum(["on"]).optional(),
});

/** "2 camps, 6 divisions, 40 bunks and 35 staff places copied." */
async function copyInto(from: string, to: string, staff: boolean): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("copy_session_setup", { p_from: from, p_to: to, p_staff: staff });
  if (error) throw error;
  const r = data as { camps: number; divisions: number; bunks: number; staff: number };
  return ` Copied ${r.camps} camps, ${r.divisions} divisions and ${r.bunks} bunks${staff ? `, and ${r.staff} staff places` : ""}.`;
}

export async function copySetup(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const from = z.guid().parse(fd.get("copy_from"));
    const to = z.guid().parse(fd.get("to"));
    const note = await copyInto(from, to, fd.get("copy_staff") === "on");
    revalidatePath("/", "layout");
    return ok(`Setup copied.${note}`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function saveSession(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const d = schema.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    const row = { name: d.name, starts_on: d.starts_on || null, ends_on: d.ends_on || null };
    if (d.id) {
      const { error } = await supabase.from("sessions").update(row).eq("id", d.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("sessions").insert(row).select("id").single();
      if (error) throw error;
      const note = d.copy_from ? await copyInto(d.copy_from, data.id, d.copy_staff === "on") : "";
      if (d.activate === "on") await makeActive(data.id);
      revalidatePath("/", "layout");
      return ok(`Session "${d.name}" created.${note}`);
    }
    revalidatePath("/", "layout");
    return ok(d.id ? "Session updated." : `Session "${d.name}" created.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

async function makeActive(id: string) {
  const supabase = await createClient();
  const off = await supabase.from("sessions").update({ is_active: false }).eq("is_active", true).neq("id", id);
  if (off.error) throw off.error;
  const on = await supabase.from("sessions").update({ is_active: true }).eq("id", id);
  if (on.error) throw on.error;
}

export async function activateSession(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    await makeActive(String(fd.get("id")));
    revalidatePath("/", "layout");
    return ok("Everyone now sees this session.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** Deletes a session and everything inside it: divisions, bunks, campers, imports and their files. */
export async function deleteSession(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(fd.get("id"));
  try {
    const supabase = await createClient();
    const { data: s } = await supabase.from("sessions").select("id, name").eq("id", id).maybeSingle();
    if (!s) return fail("Session not found.");
    const admin = createAdminClient();
    const { data: imports } = await admin.from("imports").select("id").eq("session_id", id);
    for (const imp of imports ?? []) {
      const { data: files } = await admin.storage.from("imports").list(imp.id);
      if (files?.length) await admin.storage.from("imports").remove(files.map((f) => `${imp.id}/${f.name}`));
    }
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/", "layout");
    return ok(`"${s.name}" and everything in it was deleted.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}
