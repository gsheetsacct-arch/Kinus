"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { FIELD_GROUPS } from "@/lib/labels";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

const ROLES = ["director", "division_head", "head_counselor", "counselor", "scanner", "office", "logistics"] as const;
const level = z.enum(["view", "scan", "edit"]);

/** Saves what each role can do and see. Everyone with that role gets it at once. */
export async function saveRoles(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("role_access").upsert(ROLES.map((role) => ({ role, access_level: level.parse(fd.get(`level:${role}`)) })));
    if (error) throw error;
    for (const g of Object.keys(FIELD_GROUPS)) {
      const roles = ["owner" as const, ...ROLES.filter((r) => fd.get(`see:${g}:${r}`) === "on")];
      const { error: e } = await supabase.from("field_visibility").update({ roles }).eq("field_group", g);
      if (e) throw e;
    }
    revalidatePath("/", "layout");
    return ok("Saved. Everyone in each role has these permissions now.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}
