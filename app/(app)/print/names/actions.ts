"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { extraValue } from "@/lib/import/extra-fields";
import { fixKey, parseFixes } from "@/lib/source-fixes";
import { canFixNamesFor, hebrewNameColumns } from "@/lib/print/name-columns";
import { plural } from "@/lib/utils";

const schema = z
  .array(z.object({ camperId: z.guid(), column: z.string().trim().min(1).max(200), value: z.string().trim().max(200) }))
  .min(1)
  .max(2000);

/**
 * Saves fixes to Hebrew-name columns (value "" takes a fix back). Each remembers what the
 * registration said, so next session's import carries it over only while it still applies.
 */
export async function saveNameFixes(input: { camperId: string; column: string; value: string }[]): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const items = schema.parse(input);
    const admin = createAdminClient();
    // only the Hebrew-name columns, never any other export column
    const columns = new Set((await hebrewNameColumns(admin)).map((c) => fixKey(c.column)));
    if (items.some((i) => !columns.has(fixKey(i.column)))) return fail("That column isn't one of the Hebrew-name columns.");
    const ids = [...new Set(items.map((i) => i.camperId))];
    const rows: { id: string; division_id: string | null; bunk_id: string | null; source_data: unknown; source_fixes?: unknown }[] = [];
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await admin.from("campers").select("*").in("id", ids.slice(i, i + 150));
      if (error) throw error;
      rows.push(...(data ?? []));
    }
    if (rows.length && !rows.some((r) => "source_fixes" in r)) return fail("Name fixes need the latest database update (migration 0034). Run it, then try again.");
    for (const r of rows) if (!canFixNamesFor(user, r)) return fail("You can only fix names of campers in your own part of camp.");
    const at = new Date().toISOString();
    const updates = rows.map((r) => {
      const fixes = parseFixes(r.source_fixes);
      for (const it of items.filter((i) => i.camperId === r.id)) {
        const key = fixKey(it.column);
        if (!it.value) delete fixes[key];
        else fixes[key] = { value: it.value, was: extraValue(r.source_data, it.column), by: user.id, at };
      }
      return { id: r.id, fixes };
    });
    for (let i = 0; i < updates.length; i += 25) {
      const done = await Promise.all(updates.slice(i, i + 25).map((u) => admin.from("campers").update({ source_fixes: u.fixes } as never).eq("id", u.id)));
      for (const { error } of done) if (error) throw error;
    }
    revalidatePath("/print/names");
    const saved = items.filter((i) => i.value).length;
    const undone = items.length - saved;
    return ok([saved && `Saved ${plural(saved, "fix", "fixes")}.`, undone && `Took back ${plural(undone, "fix", "fixes")}.`].filter(Boolean).join(" ") + " New uploads keep them.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}
