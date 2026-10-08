"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

const GLOBAL = ["owner", "admin", "director", "logistics", "office", "staff"] as const;
const SCOPE = ["division_head", "head_counselor", "counselor", "scanner"] as const;

export async function saveFieldVisibility(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const groups = fd.getAll("group").map(String);
  try {
    for (const g of groups) {
      const global_roles = GLOBAL.filter((r) => fd.get(`${g}:g:${r}`) === "on");
      const scope_roles = SCOPE.filter((r) => fd.get(`${g}:s:${r}`) === "on");
      const { error } = await supabase.from("field_visibility").update({ global_roles: [...global_roles], scope_roles: [...scope_roles] }).eq("field_group", g);
      if (error) throw error;
    }
    revalidatePath("/admin/settings");
    return ok("Field visibility saved.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

const office = z.object({ to: z.string().trim().email().or(z.literal("")), cc: z.string().trim().optional() });

export async function saveOfficeEmail(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  try {
    const d = office.parse(Object.fromEntries(fd));
    const cc = (d.cc ?? "").split(/[,;\s]+/).filter(Boolean);
    const supabase = await createClient();
    const { error } = await supabase.from("settings").upsert({ key: "office_email", value: { to: d.to, cc }, updated_by: me.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    revalidatePath("/admin/settings");
    return ok("Office email saved.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

const importSettings = z.object({ missingThresholdPct: z.coerce.number().min(0).max(100) });

export async function saveImportSettings(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  try {
    const d = importSettings.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    const { error } = await supabase.from("settings").upsert({ key: "import", value: d, updated_by: me.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    revalidatePath("/admin/settings");
    return ok("Import settings saved.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}
