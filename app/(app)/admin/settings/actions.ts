"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

const office = z.object({ to: z.string().trim().email("Enter a valid email address.").or(z.literal("")), cc: z.string().trim().optional() });

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

const missingRules = z.object({
  percent: z.coerce.number().int().min(0).max(100),
  after_time: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && /^\d{2}:\d{2}$/.test(v) ? v : null)),
});

/** When a camper who hasn't arrived gets flagged "check up on". */
export async function saveMissingRules(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  try {
    const d = missingRules.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    const { error } = await supabase.from("settings").upsert({ key: "missing_rules", value: d, updated_by: me.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    revalidatePath("/admin/settings");
    revalidatePath("/missing");
    return ok("Saved.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** Renames or removes the extra fields chosen on the import's column step. */
export async function saveExtraFields(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  try {
    const columns = fd.getAll("column").map(String);
    const fields = columns
      .map((column, i) => ({ column, label: String(fd.getAll("label")[i] ?? "").trim() || column, keep: fd.get(`keep:${column}`) === "on" }))
      .filter((f) => f.keep)
      .map(({ column, label }) => ({ column, label: label.slice(0, 80) }));
    const supabase = await createClient();
    const { error } = await supabase.from("settings").upsert({ key: "extra_fields", value: fields, updated_by: me.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    revalidatePath("/", "layout");
    return ok("Saved.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}
