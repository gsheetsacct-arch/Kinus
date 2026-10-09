"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

const profile = z.object({ full_name: z.string().trim().min(1, "Enter your name."), phone: z.string().trim().optional() });

export async function updateMyProfile(fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  try {
    const d = profile.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ full_name: d.full_name, phone: d.phone || null }).eq("id", me.id);
    if (error) throw error;
    revalidatePath("/", "layout");
    return ok("Saved.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function changeMyPassword(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const pw = String(fd.get("password") ?? "");
  if (pw.length < 8) return fail("Use at least 8 characters.");
  if (fd.get("confirm") !== pw) return fail("The two passwords don't match.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return fail(/different from the old/i.test(error.message) ? "That's already your password. Choose a new one." : error.message);
  return ok("Password changed. Use it next time you sign in.");
}
