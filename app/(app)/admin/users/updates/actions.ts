"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDirector } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

/** Takes someone off the updates list (they asked to stop, or signed up by mistake). */
export async function removeSignup(id: string): Promise<ActionResult> {
  await requireDirector();
  try {
    const { error } = await createAdminClient().from("update_signups").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/admin/users/updates");
    return ok("Taken off the list.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}
