"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { canUsePrintArea, isAdmin } from "@/lib/auth/permissions";
import { appUrl } from "@/lib/auth/app-url";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { getCampContext } from "@/lib/data/camp";
import { createPrintJob, processPrintJob } from "@/lib/print/jobs";
import { batchCamperIds, BATCH_WHICH, type BatchWhich } from "@/lib/print/batch";
import { renderDocument } from "@/lib/print/render";
import { loadMergeSetup, loadPrintCampers } from "@/lib/print/data";
import { mergeValues, SAMPLE_CAMPER } from "@/lib/print/merge";
import type { Layer, SheetLayout, TemplateSpec, Transform } from "@/lib/print/types";
import { parseScan } from "@/lib/attendance/scan";

async function requirePrinter() {
  const user = await requireUser();
  if (!canUsePrintArea(user)) throw new Error("Printing is for the office, directors and division heads.");
  return user;
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

/** Mark jobs printed (or not printed again). */
export async function markPrinted(ids: string[], printed = true): Promise<ActionResult> {
  try {
    const user = await requirePrinter();
    const { error } = await createAdminClient()
      .from("print_jobs")
      .update(printed ? { status: "printed", printed_at: new Date().toISOString(), printed_by: user.id } : { status: "ready", printed_at: null, printed_by: null })
      .in("id", ids);
    if (error) throw error;
    revalidatePath("/print");
    return ok(printed ? `Marked ${ids.length === 1 ? "as" : `${ids.length} jobs`} printed.` : "Back in the queue.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function cancelJobs(ids: string[]): Promise<ActionResult> {
  try {
    await requirePrinter();
    const { error } = await createAdminClient().from("print_jobs").update({ status: "cancelled" }).in("id", ids).neq("status", "printed");
    if (error) throw error;
    revalidatePath("/print");
    return ok("Cancelled.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** Make the PDF and email it again (e.g. after fixing the office email or a template). */
export async function resendJob(id: string, deliverTo?: string): Promise<ActionResult> {
  try {
    await requirePrinter();
    const admin = createAdminClient();
    if (deliverTo !== undefined) {
      const to = deliverTo.trim();
      if (to && !z.email().safeParse(to.split(/[,;\s]+/)[0]).success) return fail("That email address doesn't look right.");
      await admin.from("print_jobs").update({ deliver_to: to }).eq("id", id);
    }
    await admin.from("print_jobs").update({ status: "queued", error: null }).eq("id", id);
    const base = await appUrl();
    after(() => processPrintJob(id, base));
    revalidatePath("/print");
    return ok("Sending again…");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------
const batchSchema = z.object({
  template_id: z.guid(),
  where: z.string().default(""),
  which: z.enum(Object.keys(BATCH_WHICH) as [BatchWhich, ...BatchWhich[]]),
  copies: z.coerce.number().int().min(1).max(10).default(1),
  deliver: z.enum(["here", "email"]),
  deliver_to: z.string().trim().optional(),
});

const WHICH_SHORT: Record<BatchWhich, string | null> = { all: null, not_printed: "not printed before", present: "here now", arrived_today: "arrived today" };

/** "Bunk Tes", "Division 2", "American camp": what a batch covered, for the queue. */
async function placeName(db: Awaited<ReturnType<typeof createClient>>, where: string) {
  const [kind, id] = where.split(":");
  if (kind === "b" && id) return (await db.from("bunks").select("name, divisions(name)").eq("id", id).maybeSingle()).data?.name ?? "A bunk";
  if (kind === "d" && id) return (await db.from("divisions").select("name").eq("id", id).maybeSingle()).data?.name ?? "A division";
  const camp = await getCampContext();
  return camp.current ? `All of ${camp.current.name}` : "Whole camp";
}

async function resolveWhere(where: string) {
  const camp = await getCampContext();
  const [kind, id] = where.split(":");
  return { divisionIds: camp.divisionIds, divisionId: kind === "d" ? id : undefined, bunkId: kind === "b" ? id : undefined };
}

/** How many tags a batch would make (shown before printing). */
export async function countBatch(templateId: string, where: string, which: BatchWhich): Promise<number> {
  await requirePrinter();
  const session = await getActiveSession();
  if (!session || !templateId) return 0;
  const supabase = await createClient();
  return (await batchCamperIds(supabase, session.id, await resolveWhere(where), which, templateId)).length;
}

export async function createBatch(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requirePrinter();
    const session = await getActiveSession();
    if (!session) return fail("No active session.");
    const d = batchSchema.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    const ids = await batchCamperIds(supabase, session.id, await resolveWhere(d.where), d.which, d.template_id);
    if (!ids.length) return fail("No campers match, so there's nothing to print.");
    if (ids.length > 2000) return fail("That's more than 2,000 tags. Print one division at a time.");
    const job = await createPrintJob(user, {
      sessionId: session.id,
      templateId: d.template_id,
      camperIds: ids,
      copies: d.copies,
      deliverTo: d.deliver === "email" ? d.deliver_to || null : user.email,
      note: [await placeName(supabase, d.where), WHICH_SHORT[d.which]].filter(Boolean).join(" · "),
    });
    if (d.deliver === "email") {
      const base = await appUrl();
      after(() => processPrintJob(job.id, base));
    } else {
      await createAdminClient().from("print_jobs").update({ status: "ready" }).eq("id", job.id);
    }
    revalidatePath("/print");
    return ok(d.deliver === "email" ? `${ids.length} tags: making the PDF and emailing it.` : `${ids.length} tags ready.`, d.deliver === "here" ? `/print/jobs/${job.id}?print=1` : "/print");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

// ---------------------------------------------------------------------------
// Templates (admins)
// ---------------------------------------------------------------------------
async function requireAdminUser() {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("Only directors over all of camp can change templates.");
  return user;
}

const num = (min: number, max: number) => z.coerce.number().min(min).max(max);
const layerSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("text"), text: z.string(), x: num(-50, 500), y: num(-50, 500), w: num(1, 500), h: num(1, 500), size: num(3, 200), weight: z.union([z.literal(400), z.literal(700)]).optional(), align: z.enum(["left", "center", "right"]).optional(), color: z.string().max(40).optional(), fit: z.boolean().optional(), wrap: z.boolean().optional(), rotate: z.union([z.literal(0), z.literal(90), z.literal(-90)]).optional() }),
  z.object({ id: z.string(), type: z.literal("barcode"), text: z.string(), x: num(-50, 500), y: num(-50, 500), w: num(5, 500), h: num(3, 500), showText: z.boolean().optional(), rotate: z.union([z.literal(0), z.literal(90), z.literal(-90)]).optional() }),
  z.object({ id: z.string(), type: z.literal("qr"), text: z.string(), x: num(-50, 500), y: num(-50, 500), w: num(5, 500), h: num(5, 500) }),
  z.object({ id: z.string(), type: z.literal("box"), x: num(-50, 500), y: num(-50, 500), w: num(0.1, 500), h: num(0.1, 500), fill: z.string().max(60).optional(), radius: num(0, 100).optional(), border: z.string().max(40).optional() }),
]);
const sheetSchema = z.object({ paper: z.enum(["letter", "a4"]), cols: z.coerce.number().int().min(1).max(10), rows: z.coerce.number().int().min(1).max(20), marginMm: num(0, 50), gapMm: num(0, 50) });
const templateSchema = z.object({
  id: z.guid().optional(),
  name: z.string().trim().min(1, "Give the template a name."),
  kind: z.enum(["name_tag", "luggage_tag", "other"]),
  page_width_mm: num(10, 600),
  page_height_mm: num(10, 600),
  layers: z.array(layerSchema).max(60),
  sheet_layout: sheetSchema.nullable(),
  show_on_card: z.boolean(),
  auto_on_first_checkin: z.boolean(),
});
export type TemplateInput = z.input<typeof templateSchema>;

export async function saveTemplate(input: TemplateInput): Promise<ActionResult & { id?: string }> {
  try {
    await requireAdminUser();
    const t = templateSchema.parse(input);
    const supabase = await createClient();
    const row = { name: t.name, kind: t.kind, page_width_mm: t.page_width_mm, page_height_mm: t.page_height_mm, layers: t.layers, sheet_layout: t.sheet_layout, show_on_card: t.show_on_card, auto_on_first_checkin: t.auto_on_first_checkin, updated_at: new Date().toISOString() };
    if (t.id) {
      const { error } = await supabase.from("print_templates").update(row).eq("id", t.id);
      if (error) throw error;
      revalidatePath("/print/templates");
      return { ...ok("Template saved."), id: t.id };
    }
    const { count } = await supabase.from("print_templates").select("id", { count: "exact", head: true });
    const { data, error } = await supabase.from("print_templates").insert({ ...row, sort_order: (count ?? 0) + 1 }).select("id").single();
    if (error) throw error;
    revalidatePath("/print/templates");
    return { ...ok("Template created.", `/print/templates/${data.id}`), id: data.id };
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function duplicateTemplate(fd: FormData): Promise<ActionResult> {
  try {
    await requireAdminUser();
    const supabase = await createClient();
    const { data: t } = await supabase.from("print_templates").select("*").eq("id", String(fd.get("id"))).single();
    if (!t) return fail("Template not found.");
    const copy = { kind: t.kind, division_id: t.division_id, page_width_mm: t.page_width_mm, page_height_mm: t.page_height_mm, background_path: t.background_path, layers: t.layers, sheet_layout: t.sheet_layout, sort_order: t.sort_order + 1 };
    const { data, error } = await supabase.from("print_templates").insert({ ...copy, name: `${t.name} (copy)`, show_on_card: false, auto_on_first_checkin: false }).select("id").single();
    if (error) throw error;
    revalidatePath("/print/templates");
    return ok("Copied.", `/print/templates/${data.id}`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function deleteTemplate(fd: FormData): Promise<ActionResult> {
  try {
    await requireAdminUser();
    const supabase = await createClient();
    const id = String(fd.get("id"));
    const { count } = await supabase.from("print_jobs").select("id", { count: "exact", head: true }).eq("template_id", id);
    if (count) {
      // keep the history readable: hide it instead
      const { error } = await supabase.from("print_templates").update({ show_on_card: false, auto_on_first_checkin: false, name: `(retired) ${String(fd.get("name") ?? "")}`.trim() }).eq("id", id);
      if (error) throw error;
      revalidatePath("/print/templates");
      return ok("It was used before, so it's retired instead of deleted.", "/print/templates");
    }
    const { error } = await supabase.from("print_templates").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/print/templates");
    return ok("Template deleted.", "/print/templates");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** Upload a background (e.g. the design exported from Publisher as PNG). */
export async function uploadBackground(fd: FormData): Promise<ActionResult> {
  try {
    await requireAdminUser();
    const id = z.guid().parse(fd.get("id"));
    const file = fd.get("file");
    const admin = createAdminClient();
    if (fd.get("remove") === "1") {
      await admin.from("print_templates").update({ background_path: null }).eq("id", id);
      revalidatePath(`/print/templates/${id}`);
      return ok("Background removed.");
    }
    if (!(file instanceof File) || !file.size) return fail("Choose an image.");
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return fail("Use a PNG, JPG or WebP image. In Publisher: File → Export → Change file type → PNG.");
    if (file.size > 8 * 1024 * 1024) return fail("Images up to 8 MB, please.");
    const path = `${id}/bg-${Date.now()}.${file.type.split("/")[1]}`;
    const { error } = await admin.storage.from("templates").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
    if (error) throw error;
    await admin.from("print_templates").update({ background_path: path }).eq("id", id);
    revalidatePath(`/print/templates/${id}`);
    return ok("Background uploaded.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** The exact print rendering for the editor's "Print preview", for the same camper as the canvas. */
export async function previewTemplate(spec: TemplateSpec, who: { kind: "sample" } | { kind: "code"; code: string } | { kind: "longest" }): Promise<string> {
  await requirePrinter();
  const r = await previewValues(who);
  const values = "error" in r ? await sampleValues() : r.values;
  const admin = createAdminClient();
  let background: string | null = null;
  if (spec.background_path) {
    const { backgroundDataUrl } = await import("@/lib/print/data");
    background = await backgroundDataUrl(admin, spec.background_path);
  }
  return renderDocument({ ...spec, sheet_layout: null }, [{ values, copies: 1 }], { background, outlines: true });
}

// ---------------------------------------------------------------------------
// Merge fields and conversions (admins)
// ---------------------------------------------------------------------------
const transformSchema: z.ZodType<Transform> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("value_map"), map_id: z.guid(), fallback: z.enum(["original", "blank"]).optional() }),
  z.object({ type: z.literal("replace"), pattern: z.string().max(200), replacement: z.string().max(200), flags: z.string().max(5).optional() }),
  z.object({ type: z.literal("case"), mode: z.enum(["upper", "lower", "title"]) }),
]);
const fieldSchema = z.object({
  id: z.guid().optional(),
  key: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase().replace(/[^A-Z0-9_]+/g, "_"))
    .pipe(z.string().min(1, "Give the field a short name, like TSHIRT.")),
  label: z.string().trim().min(1),
  source_field: z.string().trim().min(1, "Choose what it starts from."),
  transforms: z.array(transformSchema).max(10),
});
export type FieldInput = z.input<typeof fieldSchema>;

export async function saveField(input: FieldInput): Promise<ActionResult> {
  try {
    await requireAdminUser();
    const f = fieldSchema.parse(input);
    for (const t of f.transforms) if (t.type === "replace") new RegExp(t.pattern, t.flags ?? "");
    const supabase = await createClient();
    const row = { key: f.key, label: f.label, source_field: f.source_field, transforms: f.transforms };
    const { error } = f.id
      ? await supabase.from("merge_fields").update(row).eq("id", f.id)
      : await supabase.from("merge_fields").insert({ ...row, sort_order: 100 });
    if (error) throw /duplicate/.test(error.message) ? new Error(`There's already a field called ${f.key}.`) : error;
    revalidatePath("/print/fields");
    return ok(`{{${f.key}}} saved.`);
  } catch (e) {
    return fail(e instanceof SyntaxError ? "One of the find-and-replace patterns isn't valid." : errorMessage(e));
  }
}

export async function deleteField(fd: FormData): Promise<ActionResult> {
  try {
    await requireAdminUser();
    const supabase = await createClient();
    const { error } = await supabase.from("merge_fields").delete().eq("id", String(fd.get("id")));
    if (error) throw error;
    revalidatePath("/print/fields");
    return ok("Field deleted. Templates that use it will leave that spot empty.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** A conversion table, written as lines of "from = to". */
export async function saveValueMap(fd: FormData): Promise<ActionResult> {
  try {
    await requireAdminUser();
    const supabase = await createClient();
    const id = String(fd.get("id") ?? "");
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return fail("Give the conversion a name.");
    const entries = String(fd.get("entries") ?? "")
      .split(/\r?\n/)
      .map((l) => l.split(/\s*(?:=|→|->|\t)\s*/))
      .filter((p) => p.length >= 2 && p[0].trim())
      .map(([s, ...o]) => ({ source_value: s.replace(/\s+/g, " ").trim(), output_value: o.join(" ").trim() }));
    // matching ignores capitals and spacing, so "Bunk Chof" and "bunk  chof" are one entry
    const unique = [...new Map(entries.map((e) => [e.source_value.toLowerCase(), e])).values()];
    let mapId = id;
    if (mapId) {
      const { error } = await supabase.from("value_maps").update({ name }).eq("id", mapId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("value_maps").insert({ name, source_field: String(fd.get("source_field") ?? "") || "custom" }).select("id").single();
      if (error) throw error;
      mapId = data.id;
    }
    const { error: delErr } = await supabase.from("value_map_entries").delete().eq("map_id", mapId);
    if (delErr) throw delErr;
    if (unique.length) {
      const { error } = await supabase.from("value_map_entries").insert(unique.map((e) => ({ ...e, map_id: mapId })));
      if (error) throw error;
    }
    revalidatePath("/print/fields");
    return ok(`${name}: ${unique.length} conversions saved.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function deleteValueMap(fd: FormData): Promise<ActionResult> {
  try {
    await requireAdminUser();
    const supabase = await createClient();
    const id = String(fd.get("id"));
    const { data: users } = await supabase.from("merge_fields").select("key, transforms");
    const usedBy = (users ?? []).filter((f) => ((f.transforms as Transform[]) ?? []).some((t) => t.type === "value_map" && t.map_id === id)).map((f) => f.key);
    if (usedBy.length) return fail(`Still used by ${usedBy.map((k) => `{{${k}}}`).join(", ")}. Remove it there first.`);
    const { error } = await supabase.from("value_maps").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/print/fields");
    return ok("Conversion deleted.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export type { Layer, SheetLayout };

/** Every field filled from the made-up sample camper. */
async function sampleValues(): Promise<Record<string, string>> {
  const setup = await loadMergeSetup(createAdminClient());
  return mergeValues(SAMPLE_CAMPER as never, setup.fields, setup.maps);
}

/**
 * Merge values for the editor's canvas: the built-in sample, a camper by code, or the
 * camper with the longest name (to check long names still fit).
 */
export async function previewValues(who: { kind: "sample" } | { kind: "code"; code: string } | { kind: "longest" }): Promise<{ values: Record<string, string>; label: string } | { error: string }> {
  await requirePrinter();
  const session = await getActiveSession();
  if (who.kind === "sample" || !session) return { values: await sampleValues(), label: "a sample camper" };
  const supabase = await createClient();
  let id: string | null = null;
  if (who.kind === "code") {
    const code = parseScan(who.code);
    if (!code) return { error: "Type a 6-digit camper code." };
    id = (await supabase.from("campers").select("id").eq("session_id", session.id).eq("camper_code", code).maybeSingle()).data?.id ?? null;
    if (!id) return { error: `No camper ${code} in your area.` };
  } else {
    const { fetchAll } = await import("@/lib/supabase/fetch-all");
    const camp = await getCampContext();
    const rows = await fetchAll((from, to) => {
      let q = supabase.from("campers").select("id, display_name").eq("session_id", session.id).is("archived_at", null);
      if (camp.divisionIds) q = q.in("division_id", camp.divisionIds);
      return q.order("id").range(from, to);
    });
    id = rows.reduce<{ id: string; n: number } | null>((best, r) => ((r.display_name?.length ?? 0) > (best?.n ?? -1) ? { id: r.id, n: r.display_name?.length ?? 0 } : best), null)?.id ?? null;
    if (!id) return { values: await sampleValues(), label: "a sample camper (no campers yet)" };
  }
  const admin = createAdminClient();
  const [setup, [c]] = await Promise.all([loadMergeSetup(admin), loadPrintCampers(admin, [id])]);
  if (!c) return { error: "Camper not found." };
  return { values: mergeValues(c, setup.fields, setup.maps), label: `${c.first_name} ${c.last_name}${who.kind === "longest" ? " (longest name)" : ""}` };
}

/** Put a field on the merge list or take it off (it keeps printing where a template uses it). */
export async function setFieldEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  try {
    await requireAdminUser();
    const supabase = await createClient();
    const { error } = await supabase.from("merge_fields").update({ enabled }).eq("id", id);
    if (error) throw /enabled/.test(error.message) ? new Error("Run migration 0012 in Supabase first.") : error;
    revalidatePath("/print/fields");
    return ok(enabled ? "On the merge list." : "Taken off the merge list.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}
