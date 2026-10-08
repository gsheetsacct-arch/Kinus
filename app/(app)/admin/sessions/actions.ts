"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  starts_on: z.string().optional(),
  ends_on: z.string().optional(),
});

export async function createSession(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const d = schema.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    const { error } = await supabase.from("sessions").insert({ name: d.name, starts_on: d.starts_on || null, ends_on: d.ends_on || null });
    if (error) throw error;
    revalidatePath("/admin/sessions");
    return ok("Session created.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function activateSession(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const off = await supabase.from("sessions").update({ is_active: false }).eq("is_active", true);
  if (off.error) return fail(off.error.message);
  const on = await supabase.from("sessions").update({ is_active: true }).eq("id", id);
  if (on.error) return fail(on.error.message);
  revalidatePath("/", "layout");
  return ok("Session activated.");
}
