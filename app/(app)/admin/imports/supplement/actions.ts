"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireAdmin } from "@/lib/auth/current-user";
import { errorMessage } from "@/lib/actions/result";
import { parseFile } from "@/lib/import";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { columnKey, humanLabel, parseExtraFields } from "@/lib/import/extra-fields";
import { fixKey, parseFixes } from "@/lib/source-fixes";
import { guessIdColumn, matchRows } from "@/lib/import/supplement";
import type { Json } from "@/lib/supabase/database.types";

const MAX_BYTES = 5 * 1024 * 1024;

export type SupplementPreview = {
  ok: true;
  headers: string[];
  idColumn: string | null;
  rows: number;
  matched: number;
  unmatched: string[];
  noId: number;
  /** each other column: a few of its values, and how many matched campers have one */
  columns: { column: string; label: string; filled: number; samples: string[]; known: boolean }[];
};

async function readAndMatch(fd: FormData) {
  const session = await getActiveSession();
  if (!session) throw new Error("Activate a session first.");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file.");
  if (file.size > MAX_BYTES) throw new Error("The file is larger than 5 MB.");
  const parsed = parseFile(new Uint8Array(await file.arrayBuffer()), file.name);
  if (!parsed.headers.length || !parsed.rows.length) throw new Error("The file has no data rows.");
  const chosen = String(fd.get("idColumn") ?? "");
  const idColumn = parsed.headers.includes(chosen) ? chosen : guessIdColumn(parsed.headers);
  const campers = await fetchAll((from, to) => createAdminClient().from("campers").select("id, source_id").eq("session_id", session.id).is("archived_at", null).order("id").range(from, to));
  const result = idColumn ? matchRows(parsed.rows, idColumn, campers) : { matched: [], unmatched: [], noId: parsed.rows.length };
  return { session, file, parsed, idColumn, ...result };
}

/** Reads the file: its ID column, who it matches, and what else it has. Changes nothing. */
export async function previewSupplement(fd: FormData): Promise<SupplementPreview | { ok: false; error: string }> {
  try {
    await requireAdmin();
    const r = await readAndMatch(fd);
    const { data: extraRow } = await createAdminClient().from("settings").select("value").eq("key", "extra_fields").maybeSingle();
    const named = parseExtraFields(extraRow?.value);
    const columns = r.parsed.headers
      .filter((h) => h !== r.idColumn && h.trim())
      .map((column) => {
        const values = r.matched.map((m) => (m.row[column] ?? "").trim()).filter(Boolean);
        const had = named.find((f) => columnKey(f.column) === columnKey(column));
        return { column, label: had?.label ?? humanLabel(column), filled: values.length, samples: [...new Set(values)].slice(0, 3), known: Boolean(had) };
      });
    return { ok: true, headers: r.parsed.headers, idColumn: r.idColumn, rows: r.parsed.rows.length, matched: r.matched.length, unmatched: r.unmatched.slice(0, 50), noId: r.noId, columns };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Adds the chosen columns to the matched campers: kept like a correction (campers.source_fixes),
 * so the next full export doesn't wipe them, and shown everywhere an export column is (camper
 * page, lists, labels, search). Empty cells change nothing. Nobody is added, moved or marked
 * missing.
 */
export async function applySupplement(fd: FormData): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const me = await requireAdmin();
    const r = await readAndMatch(fd);
    if (!r.idColumn) return { ok: false, error: "Choose the column with the registration ID." };
    const chosen = fd.getAll("column").map(String).filter((c) => r.parsed.headers.includes(c) && c !== r.idColumn);
    if (!chosen.length) return { ok: false, error: "Tick at least one column to add." };
    if (!r.matched.length) return { ok: false, error: "None of the IDs in the file match a camper in this session." };
    const admin = createAdminClient();
    const ids = r.matched.map((m) => m.camperId);
    const current = new Map<string, { source_data: unknown; source_fixes: unknown }>();
    for (let i = 0; i < ids.length; i += 150) {
      // "*": source_fixes (migration 0034) isn't in the generated types
      const { data, error } = await admin.from("campers").select("*").in("id", ids.slice(i, i + 150));
      if (error) throw error;
      for (const c of data ?? []) current.set(c.id, { source_data: c.source_data, source_fixes: (c as { source_fixes?: unknown }).source_fixes });
    }
    const at = new Date().toISOString();
    let changed = 0;
    for (const m of r.matched) {
      const c = current.get(m.camperId);
      if (!c) continue;
      const fixes = parseFixes(c.source_fixes);
      const reg = (c.source_data ?? {}) as Record<string, unknown>;
      let any = false;
      for (const col of chosen) {
        const value = String(m.row[col] ?? "").trim();
        const k = fixKey(col);
        if (!value || fixes[k]?.value === value) continue;
        const was = Object.entries(reg).find(([key]) => fixKey(key) === k)?.[1];
        fixes[k] = { value, was: was === undefined || was === null ? "" : String(was), by: me.id, at };
        any = true;
      }
      if (!any) continue;
      const { error } = await admin.from("campers").update({ source_fixes: fixes } as never).eq("id", m.camperId);
      if (error) throw error;
      changed++;
    }
    // the columns show everywhere: named as chosen, and no longer left out
    const [{ data: extraRow }, { data: hiddenRow }] = await Promise.all([
      admin.from("settings").select("value").eq("key", "extra_fields").maybeSingle(),
      admin.from("settings").select("value").eq("key", "hidden_columns").maybeSingle(),
    ]);
    const named = parseExtraFields(extraRow?.value);
    for (const col of chosen) {
      const label = String(fd.get(`label:${col}`) ?? "").trim().slice(0, 80) || humanLabel(col);
      const had = named.find((f) => columnKey(f.column) === columnKey(col));
      if (had) had.label = label;
      else named.push({ column: col.trim(), label });
    }
    const hidden = (Array.isArray(hiddenRow?.value) ? (hiddenRow.value as unknown[]) : []).filter((x): x is string => typeof x === "string" && !chosen.some((c) => columnKey(c) === columnKey(x)));
    await Promise.all([
      admin.from("settings").upsert({ key: "extra_fields", value: named as unknown as NonNullable<Json>, updated_by: me.id, updated_at: at }),
      admin.from("settings").upsert({ key: "hidden_columns", value: hidden as unknown as NonNullable<Json>, updated_by: me.id, updated_at: at }),
    ]);
    revalidatePath("/", "layout");
    const skipped = r.unmatched.length + r.noId;
    return { ok: true, message: `Added ${chosen.length === 1 ? "1 column" : `${chosen.length} columns`} for ${changed} ${changed === 1 ? "camper" : "campers"}${skipped ? `; ${skipped} ${skipped === 1 ? "row" : "rows"} matched nobody` : ""}.` };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
