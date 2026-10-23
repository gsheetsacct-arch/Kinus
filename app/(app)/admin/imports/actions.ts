"use server";
import { formatDateTime } from "@/lib/utils";
import { carryAreasTo } from "@/lib/staff/carry-areas";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireAdmin } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { parseFile, findLostText, applyMapping, matchAndDiff, resolveMultiValues, type ColumnMap, type MappingOptions, type ExistingCamper, type ParsedCamper } from "@/lib/import";
import type { Json } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { bunkOrders, divisionOrder, slotNewBunks, slotNewDivisions } from "@/lib/data/bunk-sort";
import { columnKey, humanLabel, parseExtraFields } from "@/lib/import/extra-fields";
import { campersForImport, intoProgram, layoutFit, LAYOUT_FIT } from "@/lib/import/programs";

/** The column step's choice "show it on the camper page" (an extra field). */
const EXTRA = "__extra";

type J = NonNullable<Json>;

const MAX_BYTES = 15 * 1024 * 1024;
/**
 * Part of a file's fingerprint: when Kinus reads files differently (2: repeated column names
 * keep their first filled-in copy), a file imported before may be imported once more, to fix
 * what the older reading got wrong.
 */
const READER_VERSION = "2";

export async function uploadImport(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const session = await getActiveSession();
  if (!session) return fail("Activate a session first.");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a file.");
  if (file.size > MAX_BYTES) return fail("File is larger than 15 MB.");
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = parseFile(bytes, file.name);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) return fail("The file has no data rows.");
    // "???" where letters were lost (the export was opened and saved again in Excel or WPS):
    // shown on the next step so the person can decide, instead of refusing the file
    const lost = findLostText(parsed.headers, parsed.rows);
    const hash = createHash("sha256").update(`kinus-reader-${READER_VERSION}:`).update(bytes).digest("hex");
    const admin = createAdminClient();
    const dup = await admin.from("imports").select("id, applied_at, status").eq("session_id", session.id).eq("file_hash", hash).eq("status", "applied").maybeSingle();
    if (dup.data) return fail(`This exact file was already imported on ${formatDateTime(dup.data.applied_at)}. Nothing has changed.`);

    await discardDrafts(session.id);
    // Kinus remembers how the columns were matched, for each kind of export (the main one, a
    // separate program's…): the setup that knows most of this file's columns
    const mappingId = (await layoutFor(parsed.headers))?.id ?? "";
    const { data: imp, error } = await admin
      .from("imports")
      .insert({
        session_id: session.id,
        mapping_id: mappingId || null,
        file_name: file.name,
        file_path: "",
        file_hash: hash,
        status: "uploaded",
        uploaded_by: me.id,
        options: { headers: parsed.headers, repeatedColumns: parsed.repeatedColumns ?? [], encoding: parsed.encoding, skippedEmptyRows: parsed.skippedEmptyRows, lostTextCells: lost.length, lostTextSample: lost.slice(0, 5) as unknown as J },
      })
      .select("id")
      .single();
    if (error) throw error;
    const path = `${imp.id}/${file.name.replace(/[^\w.\-֐-׿À-ſ ]+/g, "_")}`;
    const up = await admin.storage.from("imports").upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: true });
    if (up.error) throw up.error;
    await admin.from("imports").update({ file_path: `imports/${path}` }).eq("id", imp.id);
    const rows = parsed.rows.map((raw, i) => ({ import_id: imp.id, row_number: i + 2, raw: raw as unknown as J, action: "skip" as const }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error: e } = await admin.from("import_rows").insert(rows.slice(i, i + 500));
      if (e) throw e;
    }
    revalidatePath("/admin/imports");
    return ok(`Read ${parsed.rows.length} rows (${parsed.encoding}).`, `/admin/imports/${imp.id}/map`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** The remembered column setup that fits these columns best (at least half of them), if any. */
async function layoutFor(headers: string[]): Promise<{ id: string; name: string; fixedDivision: string | null } | null> {
  const { data } = await createAdminClient().from("import_mappings").select("id, name, column_map, options, is_default, created_at");
  let best: { id: string; name: string; fixedDivision: string | null; fit: number; rank: number } | null = null;
  for (const m of data ?? []) {
    const o = (m.options ?? {}) as MappingOptions;
    const fit = layoutFit(headers, { headers: o.headers, mapped: Object.keys((m.column_map ?? {}) as ColumnMap) });
    // ties: the main setup, then the newest
    const rank = (m.is_default ? 1e13 : 0) + Date.parse(m.created_at);
    if (fit >= LAYOUT_FIT && (!best || fit > best.fit || (fit === best.fit && rank > best.rank))) best = { id: m.id, name: m.name, fixedDivision: o.fixedDivision ?? null, fit, rank };
  }
  return best;
}

/** Divisions that hold a separate program (each its own export): the main export leaves them alone. */
async function programDivisions(): Promise<string[]> {
  const { data } = await createAdminClient().from("import_mappings").select("options");
  return (data ?? []).map((m) => ((m.options ?? {}) as MappingOptions).fixedDivision).filter((d): d is string => Boolean(d));
}

async function loadExisting(sessionId: string): Promise<{ existing: ExistingCamper[]; known: { name: string; bunks: string[] }[]; sourceData: Map<string, Record<string, string>> }> {
  const admin = createAdminClient();
  const [campers, { data: divisions }, { data: bunks }, contacts] = await Promise.all([
    // archived campers too: their registration id is taken, so the file must match them, not add them again
    fetchAll((from, to) => admin.from("campers").select("*").eq("session_id", sessionId).order("id").range(from, to)),
    admin.from("divisions").select("id, name").eq("session_id", sessionId),
    admin.from("bunks").select("id, division_id, name, divisions!inner(session_id)").eq("divisions.session_id", sessionId),
    fetchAll((from, to) =>
      admin
        .from("camper_contacts")
        .select("camper_id, role, slot, name, phone, phone_e164, email, source, campers!inner(session_id)")
        .eq("campers.session_id", sessionId)
        .order("id")
        .range(from, to),
    ),
  ]);
  const dName = new Map((divisions ?? []).map((d) => [d.id, d.name]));
  const bName = new Map((bunks ?? []).map((b) => [b.id, b.name]));
  const byCamper = new Map<string, ExistingCamper["contacts"]>();
  for (const c of contacts) {
    const list = byCamper.get(c.camper_id) ?? [];
    list.push({ role: c.role, slot: c.slot, name: c.name, phone: c.phone, phone_e164: c.phone_e164, email: c.email, source: c.source });
    byCamper.set(c.camper_id, list);
  }
  const existing: ExistingCamper[] = campers.map((c) => ({
    id: c.id,
    source_id: c.source_id,
    first_name: c.first_name,
    last_name: c.last_name,
    division_name: c.division_id ? (dName.get(c.division_id) ?? null) : null,
    bunk_name: c.bunk_id ? (bName.get(c.bunk_id) ?? null) : null,
    bunk_locked_by_staff: c.bunk_locked_by_staff,
    grade: c.grade,
    tshirt_size: c.tshirt_size,
    bunk_preferences: c.bunk_preferences ?? [],
    local_address: c.local_address,
    local_address_cross_streets: c.local_address_cross_streets,
    medical_notes: c.medical_notes,
    allergies: c.allergies,
    has_allergies: c.has_allergies,
    has_epipen: c.has_epipen,
    has_medications: c.has_medications,
    notes_from_parents: c.notes_from_parents,
    contacts: byCamper.get(c.id) ?? [],
    archived: Boolean(c.archived_at),
    staff_edited: c.staff_edited ?? [],
  }));
  const known = (divisions ?? []).map((d) => ({ name: d.name, bunks: (bunks ?? []).filter((b) => b.division_id === d.id).map((b) => b.name) }));
  const sourceData = new Map(campers.map((c) => [c.id, (c.source_data ?? {}) as Record<string, string>]));
  return { existing, known, sourceData };
}

/**
 * How many matched campers get new or different export columns, and which columns are new to
 * them (a column added to the export: family.city…).
 */
function columnRefresh(rows: { matchedCamperId: string | null; action: string; parsed: { source_data: Record<string, string> } }[], before: Map<string, Record<string, string>>) {
  let campers = 0;
  const added = new Map<string, number>();
  for (const r of rows) {
    if (!r.matchedCamperId || (r.action !== "update" && r.action !== "unchanged")) continue;
    const old = before.get(r.matchedCamperId) ?? {};
    let differs = false;
    for (const [k, v] of Object.entries(r.parsed.source_data ?? {})) {
      if (!(k in old)) {
        if (v !== "") added.set(k, (added.get(k) ?? 0) + 1);
        differs = true;
      } else if ((old[k] ?? "") !== v) differs = true;
    }
    if (differs) campers++;
  }
  return { campers, added: [...added.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([column, count]) => ({ column, count })) };
}

const previewSchema = z.object({
  id: z.guid(),
  // a separate program's export: everyone in it goes into this division ("" = the main export)
  fixedDivision: z.string().trim().max(100).default(""),
  takeBunksFromFile: z.enum(["on"]).optional(),
  emptyMeansUnknown: z.enum(["on"]).optional(),
  phoneDefaultRegion: z.string().trim().length(2).default("US"),
});

export async function previewImport(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  try {
    const d = previewSchema.parse(Object.fromEntries(fd));
    const admin = createAdminClient();
    const { data: imp, error } = await admin.from("imports").select("*").eq("id", d.id).single();
    if (error) throw error;
    if (imp.status === "applied") return fail("This import was already applied.");
    if (imp.status === "cancelled" || imp.status === "reverted") return fail("This import was discarded. Start a new one.");
    const active = await getActiveSession();
    if (!active || active.id !== imp.session_id) return fail("This draft belongs to another session. Start a new import in the active session.");
    const headers = ((imp.options as { headers?: string[] })?.headers ?? []) as string[];
    const columnMap: ColumnMap = {};
    const extra: string[] = [];
    for (const h of headers) {
      const t = String(fd.get(`map:${h}`) ?? "");
      if (t === EXTRA) extra.push(h);
      else if (t) columnMap[h] = t;
    }
    if (!Object.values(columnMap).includes("first_name") || !Object.values(columnMap).includes("last_name")) {
      return fail("Map at least first name and last name.");
    }
    // a separate program's division must be one of this session's
    let fixedDivision: string | null = null;
    if (d.fixedDivision) {
      const { data: div } = await admin.from("divisions").select("name").eq("session_id", imp.session_id).ilike("name", d.fixedDivision).maybeSingle();
      if (!div) return fail(`There's no division called “${d.fixedDivision}” in this session. Make it in Divisions & bunks first.`);
      fixedDivision = div.name;
    }
    let mappingOptions: MappingOptions = { phoneDefaultRegion: d.phoneDefaultRegion.toUpperCase(), emptyMeansUnknown: d.emptyMeansUnknown === "on" };
    if (imp.mapping_id) {
      const { data: m } = await admin.from("import_mappings").select("options").eq("id", imp.mapping_id).maybeSingle();
      mappingOptions = { ...((m?.options as MappingOptions) ?? {}), ...mappingOptions };
    }
    mappingOptions.fixedDivision = fixedDivision ?? undefined;
    mappingOptions.headers = headers;
    // prioritise bunk columns in header order unless the preset says otherwise
    mappingOptions.bunkColumnPriority = (mappingOptions.bunkColumnPriority ?? []).filter((c) => columnMap[c] === "bunk");

    // remembered for next time: this kind of export's column setup, updated with what was chosen
    // now. A file read with another program's setup (they share columns) gets its program's own.
    let layoutId = imp.mapping_id;
    const { data: layouts } = await admin.from("import_mappings").select("id, options");
    const programOf = (o: unknown) => ((o ?? {}) as MappingOptions).fixedDivision?.toLowerCase() ?? "";
    const current = layouts?.find((l) => l.id === layoutId);
    if (current && programOf(current.options) !== (fixedDivision ?? "").toLowerCase()) {
      layoutId = layouts?.find((l) => programOf(l.options) === (fixedDivision ?? "").toLowerCase())?.id ?? null;
      await admin.from("imports").update({ mapping_id: layoutId }).eq("id", imp.id);
    }
    if (layoutId) {
      const { data: m } = await admin.from("import_mappings").select("column_map").eq("id", layoutId).maybeSingle();
      const merged: ColumnMap = { ...((m?.column_map as ColumnMap) ?? {}) };
      for (const h of headers) delete merged[h];
      await admin
        .from("import_mappings")
        .update({ column_map: { ...merged, ...columnMap } as unknown as J, options: mappingOptions as unknown as J, ...(fixedDivision ? { name: `${fixedDivision} export` } : {}) })
        .eq("id", layoutId);
    } else {
      // a new kind of export (a separate program's): a setup of its own
      const { data: made, error: me2 } = await admin
        .from("import_mappings")
        .insert({ name: fixedDivision ? `${fixedDivision} export` : "Registration export", column_map: columnMap, options: mappingOptions as unknown as J, is_default: !fixedDivision && !layouts?.some((l) => !programOf(l.options)), created_by: me.id })
        .select("id")
        .single();
      if (me2) throw me2;
      await admin.from("imports").update({ mapping_id: made.id }).eq("id", imp.id);
    }
    // extra fields: the columns chosen to show on the camper page (others in this file are taken off)
    const { data: extraRow } = await admin.from("settings").select("value").eq("key", "extra_fields").maybeSingle();
    const keepOthers = parseExtraFields(extraRow?.value).filter((f) => !headers.some((h) => columnKey(h) === columnKey(f.column)));
    const before = parseExtraFields(extraRow?.value);
    // named on the column step; else the name it had, else one made from the column
    const chosen = extra.map((h) => {
      const had = before.find((f) => columnKey(f.column) === columnKey(h));
      // short answers set in Settings stay
      return { column: h, label: String(fd.get(`name:${h}`) ?? "").trim().slice(0, 80) || had?.label || humanLabel(h), ...(had?.answers ? { answers: had.answers } : {}) };
    });
    // two columns shown under one name ("City" from the form and from the family record) look
    // like the same thing twice: show one, or give them different names
    const byName = new Map<string, string[]>();
    for (const f of [...keepOthers, ...chosen]) byName.set(f.label.trim().toLowerCase(), [...(byName.get(f.label.trim().toLowerCase()) ?? []), f.column]);
    const clash = [...byName.entries()].find(([, cols]) => cols.length > 1);
    if (clash) {
      const [name, cols] = clash;
      const shown = [...keepOthers, ...chosen].find((f) => f.label.trim().toLowerCase() === name)!.label;
      return fail(`${cols.join(" and ")} would both show as “${shown}”. Show only one of them on the camper page, or give them different names (e.g. “${shown} (family)”).`);
    }
    await admin.from("settings").upsert({ key: "extra_fields", value: [...keepOthers, ...chosen] as unknown as J, updated_by: me.id, updated_at: new Date().toISOString() });

    const rawRows = await fetchAll((from, to) => admin.from("import_rows").select("id, row_number, raw").eq("import_id", imp.id).order("row_number").range(from, to));
    const parsedRows = rawRows.map((r) => {
      const parsed = applyMapping(r.raw as Record<string, string>, columnMap, mappingOptions);
      // a separate program's file: everyone into its division, with registration ids of its own
      return { id: r.id, rowNumber: r.row_number, parsed: fixedDivision ? intoProgram(parsed, fixedDivision) : parsed };
    });
    const loaded = await loadExisting(imp.session_id);
    const { known, sourceData } = loaded;
    // each file matches only its own campers: a program's file its division; the main export everyone else
    const others = (await programDivisions()).filter((x) => !fixedDivision || x.toLowerCase() !== fixedDivision.toLowerCase());
    const existing = campersForImport(loaded.existing, fixedDivision, fixedDivision ? [] : others);
    resolveMultiValues(parsedRows, known);
    const result = matchAndDiff(parsedRows, existing, known, { takeBunksFromFile: d.takeBunksFromFile === "on", emptyMeansUnknown: d.emptyMeansUnknown === "on" });
    // the export's other columns (labels, extra fields): applying refreshes them for every camper
    // in the file, so the preview says so, rather than "unchanged"
    const columns = columnRefresh(result.rows, sourceData);

    const rawByRow = new Map(rawRows.map((r) => [r.row_number, r]));
    for (let i = 0; i < result.rows.length; i += 200) {
      const chunk = result.rows.slice(i, i + 200).map((r) => ({
        id: rawByRow.get(r.rowNumber)!.id,
        import_id: imp.id,
        row_number: r.rowNumber,
        raw: rawByRow.get(r.rowNumber)!.raw as J,
        parsed: r.parsed as unknown as J,
        matched_camper_id: r.matchedCamperId,
        match_method: r.matchMethod,
        action: r.action,
        changes: r.changes as unknown as J,
        warnings: [...r.warnings, ...(r.candidates ? [`candidates:${JSON.stringify(r.candidates)}`] : [])],
      }));
      const { error: e3 } = await admin.from("import_rows").upsert(chunk, { onConflict: "id" });
      if (e3) throw e3;
    }
    const { data: thresholdRow } = await admin.from("settings").select("value").eq("key", "import").maybeSingle();
    const threshold = Number((thresholdRow?.value as { missingThresholdPct?: number })?.missingThresholdPct ?? 20);
    const perDivision = result.summary.divisionsInFile.map((name) => {
      const total = existing.filter((e) => e.division_name === name).length;
      const miss = result.summary.missing.filter((m) => m.division_name === name).length;
      return { name, total, missing: miss, pct: total ? Math.round((miss / total) * 100) : 0 };
    });
    const partialWarning = perDivision.filter((p) => p.total >= 5 && p.pct > threshold).map((p) => `${p.name}: ${p.missing} of ${p.total} (${p.pct}%) not in this file`);
    const { error: e4 } = await admin
      .from("imports")
      .update({
        status: "previewed",
        options: { ...(imp.options as object), columnMap, mappingOptions, fixedDivision, takeBunksFromFile: d.takeBunksFromFile === "on", emptyMeansUnknown: d.emptyMeansUnknown === "on", divisionsInFile: result.summary.divisionsInFile, partialWarning },
        summary: { ...result.summary, missing: result.summary.missing.length, missingList: result.summary.missing, columns } as unknown as J,
      })
      .eq("id", imp.id);
    if (e4) throw e4;
    revalidatePath(`/admin/imports/${imp.id}`);
    return ok("Preview ready.", `/admin/imports/${imp.id}`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function resolveConflict(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const rowId = String(fd.get("row_id"));
  const choice = String(fd.get("choice"));
  try {
    const admin = createAdminClient();
    const { data: row, error } = await admin.from("import_rows").select("id, import_id, row_number, parsed, imports!inner(session_id, options, status)").eq("id", rowId).single();
    if (error) throw error;
    const imp = row.imports as unknown as { session_id: string; options: { takeBunksFromFile?: boolean; emptyMeansUnknown?: boolean }; status: string };
    if (imp.status !== "previewed") return fail("Import is not in preview.");
    let update: { action: "add" | "skip" | "update" | "unchanged"; matched_camper_id: string | null; changes: J; match_method: string | null };
    if (choice === "add") update = { action: "add", matched_camper_id: null, changes: [], match_method: null };
    else if (choice === "skip") update = { action: "skip", matched_camper_id: null, changes: [], match_method: null };
    else {
      const { existing, known } = await loadExisting(imp.session_id);
      const target = existing.find((e) => e.id === choice);
      if (!target) return fail("Camper not found.");
      const r = matchAndDiff([{ rowNumber: row.row_number, parsed: { ...(row.parsed as unknown as ParsedCamper), source_id: null } }], [target], known, {
        takeBunksFromFile: imp.options.takeBunksFromFile ?? false,
        emptyMeansUnknown: imp.options.emptyMeansUnknown ?? true,
      }).rows[0];
      update = { action: r.action === "update" ? "update" : "unchanged", matched_camper_id: target.id, changes: r.changes as unknown as J, match_method: "manual" };
    }
    const { error: e2 } = await admin.from("import_rows").update({ ...update, warnings: [] }).eq("id", rowId);
    if (e2) throw e2;
    // refresh counts
    const rows = await fetchAll((from, to) => admin.from("import_rows").select("action").eq("import_id", row.import_id).order("id").range(from, to));
    const count = (a: string) => rows.filter((r) => r.action === a).length;
    const { data: impRow } = await admin.from("imports").select("summary").eq("id", row.import_id).single();
    await admin
      .from("imports")
      .update({ summary: { ...((impRow?.summary as object) ?? {}), added: count("add"), updated: count("update"), unchanged: count("unchanged"), conflicts: count("conflict"), skipped: count("skip") } as J })
      .eq("id", row.import_id);
    revalidatePath(`/admin/imports/${row.import_id}`);
    return ok("Resolved.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function applyImportAction(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const active = await getActiveSession();
  const { data: imp } = await supabase.from("imports").select("session_id, summary").eq("id", id).maybeSingle();
  if (!imp || !active || imp.session_id !== active.id) return fail("This draft belongs to another session. Start a new import in the active session.");
  const before = await bunkOrders(supabase, imp.session_id);
  const divisionsBefore = await divisionOrder(supabase, imp.session_id);
  const { data, error } = await supabase.rpc("apply_import", { p_import_id: id });
  if (error) return fail(errorMessage(error));
  await discardDrafts(imp.session_id, id);
  // new bunks from the file go into their Alef-Beis place (not the order they appeared in)
  await slotNewBunks(supabase, imp.session_id, before).catch(() => undefined);
  await slotNewDivisions(supabase, imp.session_id, divisionsBefore).catch(() => undefined);
  // the first import into a new session makes its divisions: staff areas follow them there
  await carryAreasTo(imp.session_id);
  const r = data as { added: number; updated: number; missing: number };
  revalidatePath("/", "layout");
  const columns = ((imp.summary ?? {}) as { columns?: { campers: number } }).columns?.campers ?? 0;
  return ok(
    `Done: ${r.added} added, ${r.updated} updated, ${r.missing} marked “not in the latest export”${columns ? `; the export's columns refreshed for ${columns}` : ""}.`,
    `/admin/imports/${id}`,
  );
}

/** Undoes the latest applied import of the session: back to how things were before it. */
export async function revertImportAction(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(fd.get("id"));
  const supabase = await createClient();
  const { data: imp } = await supabase.from("imports").select("session_id").eq("id", id).maybeSingle();
  if (!imp) return fail("Import not found.");
  const { data, error } = await supabase.rpc("revert_import", { p_import_id: id });
  if (error) return fail(errorMessage(error));
  await discardDrafts(imp.session_id);
  const r = data as { removed: number; keptCheckedIn: number; restored: number; keptFields: number };
  const parts = [
    r.removed ? `${r.removed} campers it added were removed` : null,
    r.keptCheckedIn ? `${r.keptCheckedIn} it added stay because they already checked in (marked "not in the latest export")` : null,
    r.restored ? `${r.restored} campers were put back how they were` : null,
    r.keptFields ? `${r.keptFields} later edits by staff were kept` : null,
  ].filter(Boolean);
  revalidatePath("/", "layout");
  return ok(`Import undone. ${parts.join("; ") || "Nothing needed changing"}.`, `/admin/imports/${id}`);
}

/** Drafts are previews of a moment in time; once anything is applied or undone they are stale. */
async function discardDrafts(sessionId: string, exceptId?: string) {
  const admin = createAdminClient();
  let q = admin.from("imports").update({ status: "cancelled" }).eq("session_id", sessionId).in("status", ["uploaded", "previewed"]);
  if (exceptId) q = q.neq("id", exceptId);
  await q;
}

export async function cancelImport(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(fd.get("id"));
  const admin = createAdminClient();
  const { error } = await admin.from("imports").update({ status: "cancelled" }).eq("id", id).in("status", ["uploaded", "previewed"]);
  if (error) return fail(error.message);
  revalidatePath("/admin/imports");
  return ok("Draft discarded. Nothing was changed.", "/admin/imports");
}

export async function archiveMissing(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const ids = fd.getAll("camper_id").map(String);
  if (!ids.length) return fail("Nothing selected.");
  const supabase = await createClient();
  // recorded as part of the import, so undoing the import brings them back too
  const { data, error } = await supabase.rpc("archive_missing", { p_import_id: String(fd.get("import_id") ?? ""), p_camper_ids: ids });
  if (error) return fail(errorMessage(error));
  revalidatePath("/", "layout");
  const n = Number(data ?? 0);
  // back to the same page, loaded fresh, so the list shows them as archived straight away
  return ok(`${n} ${n === 1 ? "camper" : "campers"} archived.`, `/admin/imports/${String(fd.get("import_id") ?? "")}`);
}
