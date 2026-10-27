"use server";
import { plural } from "@/lib/utils";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { canUsePrintArea, isAdmin, visibleDivisionIds } from "@/lib/auth/permissions";
import { canDesign, loadDesigners, saveDesigners } from "@/lib/print/designers";
import { addCustomFont, removeCustomFont } from "@/lib/print/custom-fonts";
import { storeTemplate, type TemplateInput } from "@/lib/print/template-store";
import { previewDocument, sampleValues, worstCaseValues } from "@/lib/print/preview-data";
import { createConnector, revokeConnector } from "@/lib/print/design-connectors";
export type { TemplateInput };
import { appUrl } from "@/lib/auth/app-url";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { getCampContext } from "@/lib/data/camp";
import { createPrintJob, processPrintJob, rememberSheetPosition } from "@/lib/print/jobs";
import { STARTED_MARK } from "@/lib/print/labels";
import { visibleJobs } from "@/lib/print/access";
import { batchCamperIds, BATCH_WHICH, type BatchWhich } from "@/lib/print/batch";
import { dismissLabelUpdates, labelUpdates, refreshPrintedHashes, type LabelUpdate } from "@/lib/print/updates";
import { loadMergeSetup, loadPrintCampers } from "@/lib/print/data";
import { mergeValues } from "@/lib/print/merge";
import type { Layer, PdfArt, SheetLayout, TemplateSpec, Transform } from "@/lib/print/types";
import { anyCode } from "@/lib/attendance/scan";

const NOT_YOURS = "That's a request for campers outside your part of camp.";

async function requirePrinter() {
  const user = await requireUser();
  if (!canUsePrintArea(user)) throw new Error("Printing is for the office, directors and division heads.");
  return user;
}

/** Buzzer (pager) numbers for everyone in the session who has none yet: 001 and up, in division and bunk order. */
export async function giveBuzzerNumbers(): Promise<ActionResult> {
  const user = await requireUser();
  if (!isAdmin(user)) return fail("Numbering everyone's buzzers is for directors over all of camp.");
  const session = await getActiveSession();
  if (!session) return fail("No active session.");
  try {
    const { assignBuzzers, formatBuzzer } = await import("@/lib/buzzers");
    const r = await assignBuzzers(session.id);
    revalidatePath("/print/batch");
    return ok(r.given ? `${plural(r.given, "camper")} got buzzer numbers ${formatBuzzer(r.first)} to ${formatBuzzer(r.last)}.` : "Everyone already has a buzzer number.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

/**
 * Mark jobs printed (or not printed again). With `sheet`, also remembers where the part-used
 * label sheet now continues (the first free label after this print).
 */
export async function markPrinted(ids: string[], printed = true, sheet?: { stock: string; used: number[] }, printedNow = false): Promise<ActionResult> {
  try {
    const user = await requirePrinter();
    if (!(await visibleJobs(ids))) return fail(NOT_YOURS);
    if (sheet) await rememberSheetPosition(z.string().min(1).max(120).parse(sheet.stock), usedSchema.parse(sheet.used), user.id);
    const { error } = await createAdminClient()
      .from("print_jobs")
      .update(printed ? { status: "printed", printed_at: new Date().toISOString(), printed_by: user.id } : { status: "ready", printed_at: null, printed_by: null })
      .in("id", ids);
    if (error) throw error;
    // printed from Kinus just now: the labels show today's details, so "changed since printed" starts from these
    if (printed && printedNow) await refreshPrintedHashes(ids).catch((e) => console.error("Updating label fingerprints failed", e));
    revalidatePath("/print");
    return ok(printed ? `Marked ${ids.length === 1 ? "as" : `${ids.length} jobs`} printed.` : "Back in the queue.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function cancelJobs(ids: string[]): Promise<ActionResult> {
  try {
    await requirePrinter();
    if (!(await visibleJobs(ids))) return fail(NOT_YOURS);
    const { data, error } = await createAdminClient().from("print_jobs").update({ status: "cancelled" }).in("id", ids).neq("status", "printed").select("id");
    if (error) throw error;
    revalidatePath("/print");
    const n = data?.length ?? 0;
    const kept = ids.length - n;
    return ok(`${n} cancelled.${kept ? ` ${kept} already printed ${kept === 1 ? "stays" : "stay"} printed.` : ""}`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** Make the PDF and email it again (e.g. after fixing the office email or a template). */
export async function resendJob(id: string, deliverTo?: string): Promise<ActionResult> {
  try {
    await requirePrinter();
    if (!(await visibleJobs([id]))) return fail(NOT_YOURS);
    const admin = createAdminClient();
    if (deliverTo !== undefined) {
      const to = deliverTo.trim();
      const bad = to.split(/[,;\s]+/).filter(Boolean).find((a) => !z.email().safeParse(a).success);
      if (bad) return fail(`“${bad}” isn't an email address.`);
      await admin.from("print_jobs").update({ deliver_to: to }).eq("id", id);
    }
    // queued with the time it starts, so the stuck-request check leaves it be while it works
    const { data: queued } = await admin
      .from("print_jobs")
      .update({ status: "queued", error: `${STARTED_MARK}${new Date().toISOString()}` })
      .eq("id", id)
      .not("status", "in", "(printed,cancelled)")
      .select("id");
    if (!queued?.length) return fail("It's already printed or cancelled. To print it again, use Print.");
    const base = await appUrl();
    after(() => processPrintJob(id, base));
    revalidatePath("/print");
    return ok("Sending again…");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

const usedSchema = z.array(z.number().int().min(1).max(500)).max(500);

/** Remember the sheet in the printer (which labels are used), without marking anything printed: one division of several, a fresh sheet, or another part-used sheet. */
export async function saveSheetPosition(stock: string, used: number[]): Promise<ActionResult> {
  try {
    const user = await requirePrinter();
    const u = usedSchema.parse(used);
    await rememberSheetPosition(z.string().min(1).max(120).parse(stock), u, user.id);
    return ok(u.length ? `Saved: ${u.length === 1 ? "1 label" : `${u.length} labels`} on the sheet already used.` : "Saved: the next print starts on a fresh sheet.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

// ---------------------------------------------------------------------------
// New and changed labels since a print
// ---------------------------------------------------------------------------
async function updatesFor(templateId?: string) {
  const session = await getActiveSession();
  if (!session) return [];
  const camp = await getCampContext();
  return labelUpdates(session.id, camp.divisionIds, templateId);
}

/** Templates with labels to print again: new campers, and campers whose details on it changed. */
export async function checkLabelUpdates(): Promise<{ ok: true; updates: LabelUpdate[] } | { ok: false; error: string }> {
  try {
    await requirePrinter();
    return { ok: true, updates: await updatesFor() };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Prints just the new and changed labels of one template (worked out again here, as they are now). */
export async function printLabelUpdates(templateId: string): Promise<ActionResult> {
  try {
    const user = await requirePrinter();
    const session = await getActiveSession();
    if (!session) return fail("No active session.");
    const [u] = await updatesFor(z.guid().parse(templateId));
    const ids = u ? [...u.fresh, ...u.changed].map((c) => c.id) : [];
    if (!ids.length) return fail("Nothing new or changed any more: it's all printed.");
    const parts = [u.fresh.length ? plural(u.fresh.length, "new camper") : null, u.changed.length ? `${u.changed.length} changed` : null].filter(Boolean).join(", ");
    const job = await createPrintJob(user, { sessionId: session.id, templateId, camperIds: ids, deliverTo: user.email, note: `Since the last print: ${parts}` });
    await createAdminClient().from("print_jobs").update({ status: "ready" }).eq("id", job.id);
    revalidatePath("/print");
    return ok(`${plural(ids.length, "tag")} ready to print.`, `/print/jobs/${job.id}?print=1`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** "Not needed": these labels don't come up again unless they change again. */
export async function dismissUpdates(templateId: string): Promise<ActionResult> {
  try {
    const user = await requirePrinter();
    const [u] = await updatesFor(z.guid().parse(templateId));
    if (u) await dismissLabelUpdates(u, user.id);
    revalidatePath("/print");
    return ok("Okay. They'll come up again only if their details change.");
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
  // what it is and what it's for, in the person's words
  purpose: z.string().trim().max(200).optional(),
});

const WHICH_SHORT: Record<BatchWhich, string | null> = { all: null, not_printed: "not printed before", changed: "new or changed", present: "here now", arrived_today: "arrived today" };

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
      note: [d.purpose, await placeName(supabase, d.where), WHICH_SHORT[d.which]].filter(Boolean).join(" · "),
    });
    if (d.deliver === "email") {
      const base = await appUrl();
      after(() => processPrintJob(job.id, base));
    } else {
      await createAdminClient().from("print_jobs").update({ status: "ready" }).eq("id", job.id);
    }
    revalidatePath("/print");
    return ok(d.deliver === "email" ? `${plural(ids.length, "tag")}: making the PDF and emailing it.` : `${plural(ids.length, "tag")} ready.`, d.deliver === "here" ? `/print/jobs/${job.id}?print=1` : "/print");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

// ---------------------------------------------------------------------------
// Templates, fields and conversions (directors over all of camp, and staff they allow)
// ---------------------------------------------------------------------------
/** Changes are written with the server's key after this check (see lib/print/designers). */
async function requireDesigner() {
  const user = await requireUser();
  if (!(await canDesign(user))) throw new Error("Only directors over all of camp, and staff they allow, can change templates.");
  return user;
}

/** Directors over all of camp allow (or stop) someone else making and changing templates. */
export async function setDesigner(profileId: string, on: boolean): Promise<ActionResult> {
  try {
    const me = await requireUser();
    if (!isAdmin(me)) return fail("Only directors over all of camp can choose who edits templates.");
    const id = z.guid().parse(profileId);
    const { data: who } = await createAdminClient().from("profiles").select("full_name, login, is_active").eq("id", id).maybeSingle();
    if (!who) return fail("That person isn't on staff.");
    if (on && (who.login !== "personal" || !who.is_active)) return fail(`${who.full_name} can't sign in with their own account, so they can't edit templates.`);
    const now = await loadDesigners();
    await saveDesigners(on ? [...now, id] : now.filter((x) => x !== id), me.id);
    revalidatePath("/print/templates");
    return ok(on ? `${who.full_name} can edit templates now.` : `${who.full_name} can't edit templates any more.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** A font file for templates (the designer's own typeface): a new font, or another weight of one. */
export async function uploadFont(fd: FormData): Promise<ActionResult> {
  try {
    const me = await requireDesigner();
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return fail("Choose a font file.");
    const font = await addCustomFont(
      { name: String(fd.get("name") ?? ""), fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), weight: fd.get("weight") === "700" ? 700 : 400, italic: fd.get("italic") === "on" },
      me.id,
    );
    revalidatePath("/print/templates", "layout");
    return ok(`${font.name} is ready: pick it in the template editor's font list.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function removeFont(id: string): Promise<ActionResult> {
  try {
    const me = await requireDesigner();
    await removeCustomFont(z.string().regex(/^[a-z0-9-]{1,48}$/).parse(id), me.id);
    revalidatePath("/print/templates", "layout");
    return ok("Font removed. Text that used it prints in the default font.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** A link that connects this person's Claude to Kinus for designing templates (shown once). */
export async function createDesignLink(label: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const me = await requireDesigner();
    const { token } = await createConnector(me.id, label);
    revalidatePath("/print/templates");
    return { ok: true, url: `${await appUrl()}/api/mcp/${token}` };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function removeDesignLink(id: string): Promise<ActionResult> {
  try {
    const me = await requireDesigner();
    await revokeConnector(String(id), me.id);
    revalidatePath("/print/templates");
    return ok("Link removed: that Claude can't reach Kinus any more.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** Previews: people who print, and people who design. */
async function requirePreviewer() {
  const user = await requireUser();
  if (!canUsePrintArea(user) && !(await canDesign(user))) throw new Error("Printing is for the office, directors and division heads.");
  return user;
}

export async function saveTemplate(input: TemplateInput): Promise<ActionResult & { id?: string }> {
  try {
    await requireDesigner();
    const r = await storeTemplate(input);
    revalidatePath("/print/templates");
    return r.created ? { ...ok("Template created.", `/print/templates/${r.id}`), id: r.id } : { ...ok("Template saved."), id: r.id };
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function duplicateTemplate(fd: FormData): Promise<ActionResult> {
  try {
    await requireDesigner();
    const supabase = createAdminClient();
    const { data: t } = await supabase.from("print_templates").select("*").eq("id", String(fd.get("id"))).single();
    if (!t) return fail("Template not found.");
    const copy = {
      kind: t.kind,
      division_id: t.division_id,
      page_width_mm: t.page_width_mm,
      page_height_mm: t.page_height_mm,
      background_path: t.background_path,
      layers: t.layers,
      sheet_layout: t.sheet_layout,
      sort_order: t.sort_order + 1,
      ...("copies" in t ? { copies: t.copies } : {}),
      ...("back" in t ? { back: t.back } : {}),
      ...("camps" in t ? { camps: t.camps } : {}),
    };
    // a copy of a retired template is a fresh, working one
    const { data, error } = await supabase
      .from("print_templates")
      .insert({ ...copy, name: `${t.name.replace(/^(\(retired\)\s*)+/, "")} (copy)`, show_on_card: false, auto_on_first_checkin: false })
      .select("id")
      .single();
    if (error) throw error;
    revalidatePath("/print/templates");
    return ok("Copied.", `/print/templates/${data.id}`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function deleteTemplate(fd: FormData): Promise<ActionResult> {
  try {
    await requireDesigner();
    const supabase = createAdminClient();
    const id = String(fd.get("id"));
    const { count } = await supabase.from("print_jobs").select("id", { count: "exact", head: true }).eq("template_id", id);
    if (count) {
      // keep the history readable: hide it instead
      const name = String(fd.get("name") ?? "").replace(/^(\(retired\)\s*)+/, "");
      const { error } = await supabase.from("print_templates").update({ show_on_card: false, auto_on_first_checkin: false, name: `(retired) ${name}`.trim() }).eq("id", id);
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

/** A picture for a template part (a camp logo…). Returns where it's stored and a data URL to show it right away. */
export async function uploadTemplateImage(fd: FormData): Promise<{ ok: true; path: string; url: string } | { ok: false; error: string }> {
  try {
    await requireDesigner();
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a picture." };
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return { ok: false, error: "Use a PNG, JPG or WebP picture." };
    if (file.size > 2 * 1024 * 1024) return { ok: false, error: "Pictures up to 2 MB, please (a logo rarely needs more). Save it smaller and try again." };
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `pictures/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await createAdminClient().storage.from("templates").upload(path, buf, { contentType: file.type, upsert: false });
    if (error) throw error;
    return { ok: true, path, url: `data:${file.type};base64,${buf.toString("base64")}` };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * A PDF for a template (artwork from InDesign…): kept as a PDF, with a picture of each page for
 * the screen. `w`/`h`: the tag's size, to pick the PDF's trim or bleed box that fits it.
 */
export async function uploadTemplatePdf(
  fd: FormData,
): Promise<{ ok: true; pages: { path: string; url: string; pdf: PdfArt; widthMm: number; heightMm: number }[] } | { ok: false; error: string }> {
  try {
    await requireDesigner();
    const file = fd.get("file");
    const uploaded = fd.get("uploaded");
    const w = Number(fd.get("w"));
    const h = Number(fd.get("h"));
    const { storePdfArt, takeUploadedPdf } = await import("@/lib/print/pdf-art");
    // a big PDF was put straight into storage (pdfUploadLinkFor); a small one comes with the request
    const bytes = typeof uploaded === "string" && uploaded ? await takeUploadedPdf(uploaded) : file instanceof File && file.size ? new Uint8Array(await file.arrayBuffer()) : null;
    if (!bytes) return { ok: false, error: "Choose a PDF." };
    const pages = await storePdfArt(bytes, w > 0 && h > 0 ? { w, h } : null);
    return { ok: true, pages: pages.map(({ png, ...p }) => ({ ...p, url: `data:image/png;base64,${png.toString("base64")}` })) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** A one-time link to put a big PDF straight into storage (a request to Kinus carries 4.5 MB at most). */
export async function pdfUploadLinkFor(): Promise<{ ok: true; path: string; url: string } | { ok: false; error: string }> {
  try {
    await requireDesigner();
    const { pdfUploadLink } = await import("@/lib/print/pdf-art");
    const { path, url } = await pdfUploadLink();
    return { ok: true, path, url };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Upload a background (e.g. the design exported from Publisher as PNG). */
export async function uploadBackground(fd: FormData): Promise<ActionResult> {
  try {
    await requireDesigner();
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
    // Vercel turns away uploads over 4.5 MB before they get here
    if (file.size > 4 * 1024 * 1024) return fail("Images up to 4 MB, please. Save it again as JPG, or at a smaller size.");
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
/** Real barcodes and QR codes for the editor, the same ones that print. */
export async function codePreviews(items: { type: "barcode" | "qr" | "qr-round"; text: string }[]): Promise<{ svg: string; modules: number }[]> {
  await requirePreviewer();
  const { code128Modules, code128Svg, qrRoundSvg, qrSvg } = await import("@/lib/print/barcode");
  return items.slice(0, 40).map(({ type, text }) => {
    const svg = type === "qr" ? qrSvg(text.slice(0, 500)) : type === "qr-round" ? qrRoundSvg(text.slice(0, 500)) : code128Svg(text.slice(0, 80));
    return { svg, modules: type === "qr" ? 0 : code128Modules(svg) };
  });
}

export async function previewTemplate(spec: TemplateSpec, who: { kind: "sample" } | { kind: "worst" } | { kind: "code"; code: string } | { kind: "longest"; texts?: { text: string; w: number }[] }, opts: { fullSheet?: boolean } = {}): Promise<string> {
  await requirePreviewer();
  const r = await previewValues(who);
  const values = "error" in r ? await sampleValues() : r.values;
  // a test sheet: the whole sheet filled, with outlines, to hold against the labels
  const sheet = opts.fullSheet ? spec.sheet_layout : null;
  return previewDocument(spec, [{ values, copies: sheet ? sheet.cols * sheet.rows : 1 }], { fullSheet: opts.fullSheet });
}

// ---------------------------------------------------------------------------
// Merge fields and conversions (admins)
// ---------------------------------------------------------------------------
const transformSchema: z.ZodType<Transform> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("value_map"), map_id: z.guid(), fallback: z.enum(["original", "blank"]).optional() }),
  z.object({ type: z.literal("replace"), pattern: z.string().max(200), replacement: z.string().max(200), flags: z.string().max(5).optional() }),
  z.object({ type: z.literal("case"), mode: z.enum(["upper", "lower", "title"]) }),
  z.object({ type: z.literal("hebrew_number"), to: z.enum(["number", "hebrew", "hebrew_marks"]), keep_words: z.boolean().optional() }),
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
    await requireDesigner();
    const f = fieldSchema.parse(input);
    for (const t of f.transforms) if (t.type === "replace") new RegExp(t.pattern, t.flags ?? "");
    const supabase = createAdminClient();
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
    await requireDesigner();
    const supabase = createAdminClient();
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
    await requireDesigner();
    const supabase = createAdminClient();
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
    await requireDesigner();
    const supabase = createAdminClient();
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

/**
 * Merge values for the editor's canvas: the built-in sample, a camper by code, or the
 * camper with the longest name (to check long names still fit).
 */
export async function previewValues(
  who: { kind: "sample" } | { kind: "worst" } | { kind: "code"; code: string } | { kind: "longest"; texts?: { text: string; w: number }[] },
): Promise<{ values: Record<string, string>; label: string } | { error: string }> {
  const user = await requirePreviewer();
  const session = await getActiveSession();
  if (who.kind === "sample" || !session) return { values: await sampleValues(), label: "a sample camper" };
  if (who.kind === "worst") {
    // every field's longest value at once, among the campers this person sees (the camp chosen at the top)
    const camp = await getCampContext();
    return worstCaseValues(camp.divisionIds ?? visibleDivisionIds(user));
  }
  const supabase = await createClient();
  let id: string | null = null;
  if (who.kind === "code") {
    const code = anyCode(who.code);
    if (!code) return { error: "Type a camper code (0012)." };
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
    const texts = (who.texts ?? []).filter((t) => t.text.includes("{{") && t.w > 0).slice(0, 30);
    if (texts.length && rows.length) {
      // the camper whose text is longest for its box, on any part of this template (names, bunks, Hebrew…)
      const admin = createAdminClient();
      const [setup, campers] = await Promise.all([loadMergeSetup(admin), loadPrintCampers(admin, rows.map((r) => r.id))]);
      const { fill } = await import("@/lib/print/merge");
      let best: { id: string; score: number } | null = null;
      for (const c of campers) {
        const v = mergeValues(c, setup.fields, setup.maps);
        const score = Math.max(...texts.map((t) => fill(t.text, (k) => v[k] ?? "").length / t.w));
        if (!best || score > best.score) best = { id: c.id, score };
      }
      id = best?.id ?? null;
    } else {
      id = rows.reduce<{ id: string; n: number } | null>((best, r) => ((r.display_name?.length ?? 0) > (best?.n ?? -1) ? { id: r.id, n: r.display_name?.length ?? 0 } : best), null)?.id ?? null;
    }
    if (!id) return { values: await sampleValues(), label: "a sample camper (no campers yet)" };
  }
  const admin = createAdminClient();
  const [setup, [c]] = await Promise.all([loadMergeSetup(admin), loadPrintCampers(admin, [id])]);
  if (!c) return { error: "Camper not found." };
  return { values: mergeValues(c, setup.fields, setup.maps), label: `${c.first_name} ${c.last_name}${who.kind === "longest" ? " (longest name)" : ""}` };
}

/**
 * Every camper's values for these fields (the camp chosen at the top), for the editor's fit
 * check: it measures each text part for each camper exactly as it prints.
 */
export async function fitCheckPeople(keys: string[]): Promise<{ ok: true; people: { name: string; code: string; values: Record<string, string> }[] } | { ok: false; error: string }> {
  try {
    await requirePreviewer();
    const session = await getActiveSession();
    if (!session) return { ok: true, people: [] };
    const wanted = [...new Set(keys.filter((k) => /^[A-Z0-9_]{1,40}$/.test(k)))].slice(0, 40);
    if (!wanted.length) return { ok: true, people: [] };
    const { fetchAll } = await import("@/lib/supabase/fetch-all");
    const camp = await getCampContext();
    const supabase = await createClient();
    const rows = await fetchAll((from, to) => {
      let q = supabase.from("campers").select("id").eq("session_id", session.id).is("archived_at", null);
      if (camp.divisionIds) q = q.in("division_id", camp.divisionIds);
      return q.order("id").range(from, to);
    });
    const admin = createAdminClient();
    const [setup, campers] = await Promise.all([loadMergeSetup(admin), loadPrintCampers(admin, rows.slice(0, 3000).map((r) => r.id))]);
    return {
      ok: true,
      people: campers.map((c) => {
        const v = mergeValues(c, setup.fields, setup.maps);
        return { name: `${c.first_name} ${c.last_name}`, code: String((c as { camper_code?: string }).camper_code ?? ""), values: Object.fromEntries(wanted.map((k) => [k, v[k] ?? ""])) };
      }),
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Put a field on the merge list or take it off (it keeps printing where a template uses it). */
export async function setFieldEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  try {
    await requireDesigner();
    const supabase = createAdminClient();
    const { error } = await supabase.from("merge_fields").update({ enabled }).eq("id", id);
    if (error) throw /enabled/.test(error.message) ? new Error("Run migration 0012 in Supabase first.") : error;
    revalidatePath("/print/fields");
    return ok(enabled ? "On the merge list." : "Taken off the merge list.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}
