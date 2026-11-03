"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { FIELD_BY_KEY } from "@/lib/fields";
import { parseFlags } from "@/lib/camper-flags";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { SLEEPING_COLUMN } from "@/lib/sleeping";

const schema = z.object({
  id: z.guid().optional().or(z.literal("")),
  name: z.string().trim().min(1),
  audience: z.enum(["counselor", "head_counselor", "division_head", "director", "office", "custom"]),
  // bunk, division, or any field: a Kinus one, Sleeping, or an export column
  group_by: z.string().max(200).refine((k) => k === "" || Boolean(FIELD_BY_KEY[k]) || k === SLEEPING_COLUMN || /^source\.[^\s{}|]{1,120}$/.test(k), "Pick what to group by."),
  sort_field: z.string().default("last_name"),
  is_default: z.enum(["on"]).optional(),
});

export async function savePreset(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  try {
    const d = schema.parse(Object.fromEntries(fd));
    const columns = fd.getAll("columns").map(String).filter((k) => FIELD_BY_KEY[k] || k === SLEEPING_COLUMN || /^source\.[^\s{}|]{1,120}$/.test(k));
    // combined columns: at least one field each (a name, or "Combined"); a new one (no id yet)
    // gets one; each shows when "Show this column" is ticked
    const combos: { id: string; label: string; parts: string[]; sep: string; labels: boolean }[] = [];
    for (let i = 0; i < 12; i++) {
      const label = String(fd.get(`combo_label_${i}`) ?? "").trim().slice(0, 60) || (fd.has(`combo_id_${i}`) ? "Combined" : "");
      const parts = fd.getAll(`combo_part_${i}`).map(String).filter((k) => FIELD_BY_KEY[k] || k === SLEEPING_COLUMN || /^source\.[^\s{}|]{1,120}$/.test(k)).slice(0, 12);
      if (!label || !parts.length) continue;
      const had = String(fd.get(`combo_id_${i}`) ?? "");
      const id = /^[a-z0-9]{4,12}$/.test(had) ? had : Math.random().toString(36).slice(2, 10);
      const sep = String(fd.get(`combo_sep_${i}`) ?? "dot");
      combos.push({ id, label, parts, sep: ["dot", "comma", "slash", "line"].includes(sep) ? sep : "dot", labels: fd.get(`combo_labels_${i}`) === "on" });
      if (fd.get(`combo_show_${i}`) === "on") columns.push(`combo:${id}`);
    }
    if (columns.length === 0) return fail("Tick at least one column.");
    const supabase = await createClient();
    const row = {
      name: d.name,
      audience: d.audience,
      columns,
      group_by: d.group_by || null,
      sort: [...(d.group_by ? [{ field: d.group_by, dir: "asc" }] : []), { field: d.sort_field, dir: "asc" }],
      is_default: d.is_default === "on",
      filters: {
        only: parseFlags(fd.getAll("only").map(String).join(",")),
        match: fd.get("match") === "all" ? "all" : "any",
        // "only campers whose <column> is one of these"
        where: fd
          .getAll("where_column")
          .map((c, i) => ({ column: String(c).slice(0, 200), values: String(fd.getAll("where_values")[i] ?? "").split(",").map((v) => v.trim().slice(0, 100)).filter(Boolean).slice(0, 20) }))
          .filter((w) => w.column && w.values.length)
          .slice(0, 5),
        combos,
      },
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

/** A copy of a layout to change, without touching the original (opens the copy). */
export async function copyPreset(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  try {
    const supabase = await createClient();
    const { data: p, error } = await supabase.from("list_presets").select("name, audience, columns, sort, group_by, filters").eq("id", String(fd.get("id"))).single();
    if (error || !p) return fail("Layout not found.");
    const { data: names } = await supabase.from("list_presets").select("name");
    let name = `Copy of ${p.name}`;
    for (let n = 2; names?.some((x) => x.name === name); n++) name = `Copy of ${p.name} (${n})`;
    const { data: copy, error: e } = await supabase.from("list_presets").insert({ ...p, name, is_default: false, created_by: me.id }).select("id").single();
    if (e) throw e;
    revalidatePath("/admin/presets");
    revalidatePath("/lists");
    return ok(`“${name}” made. Change it here.`, `/admin/presets/${copy.id}`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}
