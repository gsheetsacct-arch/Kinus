"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { FIELD_BY_KEY } from "@/lib/fields";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

const schema = z.object({
  id: z.guid().optional().or(z.literal("")),
  name: z.string().trim().min(1),
  audience: z.enum(["counselor", "head_counselor", "division_head", "director", "office", "custom"]),
  group_by: z.enum(["bunk", "division", ""]),
  sort_field: z.string().default("last_name"),
  is_default: z.enum(["on"]).optional(),
});

export async function savePreset(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  try {
    const d = schema.parse(Object.fromEntries(fd));
    const columns = fd.getAll("columns").map(String).filter((k) => FIELD_BY_KEY[k]);
    if (columns.length === 0) return fail("Tick at least one column.");
    const supabase = await createClient();
    const row = {
      name: d.name,
      audience: d.audience,
      columns,
      group_by: d.group_by || null,
      sort: [...(d.group_by ? [{ field: d.group_by, dir: "asc" }] : []), { field: d.sort_field, dir: "asc" }],
      is_default: d.is_default === "on",
    };
    const { error } = d.id ? await supabase.from("list_presets").update(row).eq("id", d.id) : await supabase.from("list_presets").insert({ ...row, created_by: me.id });
    if (error) throw error;
    revalidatePath("/admin/presets");
    revalidatePath("/lists");
    return ok("Layout saved.", "/admin/presets");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function deletePreset(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("list_presets").delete().eq("id", String(fd.get("id")));
  if (error) return fail(error.message);
  revalidatePath("/admin/presets");
  return ok("Layout deleted.", "/admin/presets");
}
