import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessBunk, seesAllCamp, type CurrentUser } from "@/lib/auth/permissions";
import { renderDocument } from "./render";
import { mergeValues } from "./merge";
import { htmlToPdf } from "./pdf";
import { sendEmail } from "./email";
import { backgroundDataUrl, byBunkThenName, imageDataUrls, loadMergeSetup, loadPrintCampers, toSpec } from "./data";
import { contentHash, sameContent, templateKeys } from "./content";
import type { TemplateSpec } from "./types";
import type { Database } from "@/lib/supabase/database.types";
import { isProgressMark, RETRY_MARK, STARTED_MARK } from "./labels";
import { cleanUsed, sheetStock, usedBefore } from "./sheet-position";

/** Office, directors and admins print for anyone; others need check-in access to the camper. */
export function canPrintFor(user: CurrentUser, camper: { division_id: string | null; bunk_id: string | null }) {
  // the office and logistics (bus tags) print for anyone in their area, even with view access
  if (user.role === "office" || user.role === "logistics" || user.role === "owner") return seesAllCamp(user) || (camper.division_id ? canAccessBunk(user, camper.division_id, camper.bunk_id, "view") : false);
  if (user.role === "director") return camper.division_id ? canAccessBunk(user, camper.division_id, camper.bunk_id, "view") : seesAllCamp(user);
  return camper.division_id ? canAccessBunk(user, camper.division_id, camper.bunk_id, "scan") : false;
}

/** Of these printed labels (camper → fingerprint when printed), the ones whose details changed since. */
export async function changedSince(db: Parameters<typeof loadPrintCampers>[0], spec: TemplateSpec, printed: Map<string, string>): Promise<Set<string>> {
  if (!printed.size) return new Set();
  const keys = templateKeys(spec);
  const [campers, setup] = await Promise.all([loadPrintCampers(db, [...printed.keys()]), loadMergeSetup(db)]);
  return new Set(campers.filter((c) => !sameContent(printed.get(c.id)!, keys, mergeValues(c, setup.fields, setup.maps))).map((c) => c.id));
}

/** What each camper's label says right now, as fingerprints (see contentHash). */
export async function labelHashes(db: Parameters<typeof loadPrintCampers>[0], spec: TemplateSpec, camperIds: string[]): Promise<Map<string, string>> {
  const keys = templateKeys(spec);
  const [campers, setup] = await Promise.all([loadPrintCampers(db, camperIds), loadMergeSetup(db)]);
  return new Map(campers.map((c) => [c.id, contentHash(keys, mergeValues(c, setup.fields, setup.maps))]));
}

export async function officeEmail(): Promise<{ to: string; cc: string[] }> {
  const admin = createAdminClient();
  const { data } = await admin.from("settings").select("value").eq("key", "office_email").maybeSingle();
  const v = (data?.value ?? {}) as { to?: string; cc?: string[] };
  return { to: v.to ?? "", cc: v.cc ?? [] };
}

export async function createPrintJob(
  user: CurrentUser,
  opts: { sessionId: string; templateId: string; camperIds: string[]; copies?: number; deliverTo?: string | null; note?: string | null },
): Promise<{ id: string; count: number; copies: number }> {
  const admin = createAdminClient();
  const { data: template } = await admin.from("print_templates").select("*").eq("id", opts.templateId).single();
  if (!template) throw new Error("That template no longer exists.");
  const ids = [...new Set(opts.camperIds)];
  if (!ids.length) throw new Error("No campers selected.");
  // permission check per camper
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await admin.from("campers").select("id, division_id, bunk_id").in("id", ids.slice(i, i + 150));
    for (const c of data ?? []) if (!canPrintFor(user, c)) throw new Error("You can only request tags for campers in your own division or bunk.");
  }
  // empty: the office (whatever its address is when the email goes out)
  const deliver = opts.deliverTo?.trim() || "";
  const { data: job, error } = await admin
    .from("print_jobs")
    .insert({ session_id: opts.sessionId, kind: template.kind, template_id: template.id, deliver_to: deliver, requested_by: user.id, status: "queued", item_count: ids.length, note: opts.note ?? null })
    .select("id")
    .single();
  if (error) throw error;
  // how many of each: as asked, else the template's usual number (migration 0028)
  const copies = Math.min(Math.max(Math.round(opts.copies ?? (Number((template as { copies?: number }).copies) || 1)), 1), 10);
  const hashes = await labelHashes(admin, toSpec(template), ids);
  for (let i = 0; i < ids.length; i += 500) {
    const { error: e } = await admin.from("print_job_items").insert(ids.slice(i, i + 500).map((camper_id) => ({ job_id: job.id, camper_id, copies, content_hash: hashes.get(camper_id) ?? null })));
    if (e) throw e;
  }
  return { id: job.id, count: ids.length, copies };
}

type PrintSet = Awaited<ReturnType<typeof loadPrintSet>>;

/**
 * One or more requests for the same template, as one thing to print. A camper asked for in
 * two requests (a double tap, or two people asking) prints once, with the most copies asked.
 */
async function loadPrintSet(jobIds: string[]) {
  const admin = createAdminClient();
  const ids = [...new Set(jobIds)];
  if (!ids.length) throw new Error("Nothing to print.");
  const { data: jobs, error } = await admin.from("print_jobs").select("*, print_templates(*), profiles:requested_by(full_name)").in("id", ids);
  if (error) throw error;
  if (!jobs || jobs.length !== ids.length) throw new Error("Some of these requests are gone. Go back to the print queue.");
  const templateIds = new Set(jobs.map((j) => j.template_id));
  if (templateIds.size > 1) throw new Error("Only requests for the same tag can be printed together.");
  const template = jobs[0].print_templates;
  if (!template) throw new Error("The template for this job was deleted.");
  const spec = toSpec(template as never);
  const items = await import("@/lib/supabase/fetch-all").then(({ fetchAll }) =>
    fetchAll((from, to) => admin.from("print_job_items").select("camper_id, copies").in("job_id", ids).order("camper_id").range(from, to)),
  );
  const copiesOf = new Map<string, number>();
  for (const i of items) copiesOf.set(i.camper_id, Math.max(copiesOf.get(i.camper_id) ?? 0, i.copies));
  const [campers, setup, background, images] = await Promise.all([
    loadPrintCampers(admin, [...copiesOf.keys()]),
    loadMergeSetup(admin),
    backgroundDataUrl(admin, spec.background_path),
    imageDataUrls(admin, spec.layers),
  ]);
  campers.sort(byBunkThenName);
  return { jobs, spec, campers, copiesOf, setup, background, images, askedMoreThanOnce: items.length > copiesOf.size };
}

const divisionOf = (c: { division_id?: string | null }) => c.division_id ?? null;

function setHtml(set: PrintSet, opts: { start?: number; used?: number[]; divisionId?: string | null; copies?: number }) {
  const campers = opts.divisionId === undefined ? set.campers : set.campers.filter((c) => divisionOf(c as never) === opts.divisionId);
  const stock = sheetStock(set.spec);
  const html = renderDocument(
    set.spec,
    // copies: as asked, or the same number of each chosen when printing
    campers.map((c) => ({ values: mergeValues(c, set.setup.fields, set.setup.maps), copies: opts.copies ? Math.min(10, Math.max(1, Math.round(opts.copies))) : (set.copiesOf.get(c.id) ?? 1) })),
    { background: set.background, images: set.images, usedSlots: stock ? (opts.used ?? (opts.start ? usedBefore(opts.start, stock.perSheet) : [])) : [] },
  );
  return { html, campers };
}

/** The printable page for requests printed together (all, or one division), starting at a label on a part-used sheet. */
export async function printSetHtml(jobIds: string[], opts: { start?: number; used?: number[]; divisionId?: string | null; copies?: number } = {}): Promise<string> {
  return setHtml(await loadPrintSet(jobIds), opts).html;
}

/** What a set of requests holds: the template, its label stock, and the tags per division. */
export async function printSetSummary(jobIds: string[]) {
  const set = await loadPrintSet(jobIds);
  const tagsOf = (cs: typeof set.campers) => cs.reduce((n, c) => n + (set.copiesOf.get(c.id) ?? 1), 0);
  const parts = new Map<string, { divisionId: string | null; name: string; color: string | null; tags: number; campers: number }>();
  for (const c of set.campers) {
    const id = divisionOf(c as never);
    const k = id ?? "none";
    const p = parts.get(k) ?? { divisionId: id, name: c.division_name ?? "No division", color: c.division_color, tags: 0, campers: 0 };
    p.tags += set.copiesOf.get(c.id) ?? 1;
    p.campers += 1;
    parts.set(k, p);
  }
  return {
    templateId: set.spec.id ?? set.jobs[0].template_id,
    templateName: set.spec.name,
    spec: set.spec,
    stock: sheetStock(set.spec),
    tags: tagsOf(set.campers),
    campers: set.campers.length,
    requests: set.jobs.length,
    parts: [...parts.values()],
    statuses: set.jobs.map((j) => j.status),
    askedMoreThanOnce: set.askedMoreThanOnce,
  };
}

/** Builds the printable HTML for a job (used by the PDF, the browser print page and previews). */
export async function jobHtml(jobId: string, opts: { start?: number } = {}): Promise<{ html: string; job: { id: string; deliver_to: string; template_name: string; count: number; tags: number; requested_by_name: string; first_camper: string; campers: string[]; note: string | null } }> {
  const set = await loadPrintSet([jobId]);
  const job = set.jobs[0];
  const { html, campers } = setHtml(set, { start: opts.start });
  const copiesOf = set.copiesOf;
  const first = campers[0];
  return {
    html,
    job: {
      id: job.id,
      deliver_to: job.deliver_to,
      template_name: set.spec.name,
      count: campers.length,
      tags: campers.reduce((n, c) => n + (copiesOf.get(c.id) ?? 1), 0),
      requested_by_name: (job.profiles as { full_name: string } | null)?.full_name ?? "someone",
      first_camper: first ? `${first.first_name} ${first.last_name}${first.bunk_name ? ` · ${first.bunk_name}` : ""}` : "",
      // who the tags are for (the first few), for the email
      campers: campers.slice(0, 12).map((c) => `${c.first_name} ${c.last_name}${[c.division_name, c.bunk_name].filter(Boolean).length ? ` (${[c.division_name, c.bunk_name].filter(Boolean).join(" · ")})` : ""}${(copiesOf.get(c.id) ?? 1) > 1 ? ` × ${copiesOf.get(c.id)}` : ""}`),
      note: job.note ?? null,
    },
  };
}

/**
 * Renders a job to PDF, stores it, and emails the office. Never throws: the outcome is
 * written to the job (ready / sent / failed) so the print queue always shows it.
 */
export async function processPrintJob(jobId: string, appUrl: string, opts: { retry?: boolean } = {}): Promise<void> {
  const admin = createAdminClient();
  // claim this attempt: it says when it started (so a cut-off one can be found) and never
  // touches a request that was printed or cancelled in the meantime
  const mark = `${opts.retry ? RETRY_MARK : STARTED_MARK}${new Date().toISOString()}`;
  const { data: claimed } = await admin.from("print_jobs").update({ status: "rendering", error: mark }).eq("id", jobId).in("status", ["queued", "rendering"]).select("id");
  if (!claimed?.length) return;
  // the outcome is written only if this attempt still owns the request
  const finish = (patch: Database["public"]["Tables"]["print_jobs"]["Update"]) => admin.from("print_jobs").update(patch).eq("id", jobId).eq("status", "rendering").eq("error", mark);
  try {
    const { html, job } = await jobHtml(jobId);
    let pdf: Buffer | null = null;
    let pdfError: string | null = null;
    try {
      // a very big batch could run out of time making the PDF: the email links to the queue instead
      if (job.tags > PDF_MAX_TAGS) throw new Error(`more than ${PDF_MAX_TAGS} tags; print it from Kinus`);
      pdf = await htmlToPdf(html);
      const { error } = await admin.storage.from("print-output").upload(`${jobId}.pdf`, pdf, { contentType: "application/pdf", upsert: true });
      if (error) throw error;
      await admin.from("print_jobs").update({ pdf_path: `${jobId}.pdf` }).eq("id", jobId);
    } catch (e) {
      pdfError = `PDF could not be made (${e instanceof Error ? e.message : String(e)}). Print it from the queue instead.`;
      pdf = null;
    }
    const link = `${appUrl}/print/jobs/${jobId}`;
    const subject = `To print: ${job.count === 1 ? `${job.template_name} · ${job.first_camper}` : `${job.template_name} × ${job.count}`} · from ${job.requested_by_name}`;
    const office = await officeEmail();
    const to = (job.deliver_to || office.to).split(/[,;\s]+/).filter(Boolean);
    if (!to.length) {
      await finish({ status: "ready", error: pdfError ?? "No office email set, so it waits in the print queue." });
      return;
    }
    const sent = await sendEmail({
      to,
      cc: job.deliver_to && job.deliver_to !== office.to ? [] : office.cc,
      subject,
      html: requestEmailHtml({ ...job, link, queueLink: `${appUrl}/print`, attached: Boolean(pdf) }),
      attachments: pdf ? [{ filename: `${job.template_name.replace(/[^\w-]+/g, "-")}-${jobId.slice(0, 8)}.pdf`, content: pdf }] : undefined,
    });
    if (sent.sent) await finish({ status: "sent", email_message_id: sent.id, error: pdfError });
    else await finish({ status: "ready", error: [pdfError, sent.reason].filter(Boolean).join(" ") });
  } catch (e) {
    await finish({ status: "failed", error: e instanceof Error ? e.message : String(e) });
  }
}

const escHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The office's email for a request: who asked and for whom, and why printing from Kinus
 * (the print queue) beats printing this PDF.
 */
export function requestEmailHtml(j: { requested_by_name: string; count: number; template_name: string; campers: string[]; note: string | null; link: string; queueLink: string; attached: boolean }): string {
  const list = j.campers.map((c) => `<li dir="auto">${escHtml(c)}</li>`).join("");
  const more = j.count > j.campers.length ? `<li>and ${j.count - j.campers.length} more</li>` : "";
  const button = "display:inline-block;background:#0f5f8a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold";
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px">
<p><strong>${escHtml(j.requested_by_name)}</strong> asked for <strong>${j.count} × ${escHtml(j.template_name)}</strong>${j.note ? ` (${escHtml(j.note)})` : ""}.</p>
${list ? `<ul style="padding-left:20px;margin:0 0 16px">${list}${more}</ul>` : ""}
<p style="margin:0 0 8px"><a href="${escHtml(j.queueLink)}" style="${button}">Open the print queue in Kinus</a></p>
<p style="margin:0 0 16px;font-size:13px"><a href="${escHtml(j.link)}" style="color:#0f5f8a">or just this request</a></p>
<p style="margin:0 0 6px"><strong>Please print from Kinus rather than from this email:</strong></p>
<ul style="padding-left:20px;margin:0 0 16px">
<li><strong>Everything waiting, in one place.</strong> Other requests may have come in since this one: the queue shows them all.</li>
<li><strong>Fewer prints.</strong> Requests for the same tag print together in one go, sorted by division and bunk, or one division at a time.</li>
<li><strong>No wasted label sheets.</strong> Kinus remembers how much of the label sheet is used and starts on the next free label. This PDF always starts at the top of a fresh sheet.</li>
<li><strong>Staff can see it's done.</strong> Marking it printed shows on the camper's card, so nobody asks twice.</li>
</ul>
<p style="color:#666;font-size:13px">${j.attached ? "The PDF is attached in case you can't open Kinus right now." : "There's no PDF this time: print it from Kinus."}</p>
</div>`;
}

/**
 * The sheet in each printer: which labels on it are used. One settings row per camp and label
 * stock ("label_sheet:<camp>/<stock>" → { used: [1, 2, 5] }), so each camp's office keeps its own
 * and two writers never overwrite each other's. Older rows ("next": first free label, or the
 * one "label_sheets" row) still count.
 */
export async function sheetPositions(): Promise<Record<string, number[]>> {
  const { data } = await createAdminClient().from("settings").select("key, value").or("key.like.label_sheet:%,key.eq.label_sheets");
  const read = (x: unknown): number[] => {
    if (typeof x === "number") return usedBefore(x, 500);
    const v = (x ?? {}) as { used?: number[]; next?: number };
    return Array.isArray(v.used) ? v.used.filter((n) => Number.isInteger(n)) : usedBefore(v.next ?? 1, 500);
  };
  const out: Record<string, number[]> = {};
  for (const r of data ?? []) {
    if (r.key === "label_sheets") {
      for (const [k, x] of Object.entries((r.value ?? {}) as Record<string, unknown>)) out[k] ??= read(x);
    } else out[r.key.slice("label_sheet:".length)] = read(r.value);
  }
  return out;
}

/** The label stock as remembered for this camp ("<camp>/<stock>"), and which labels on its sheet are used. */
export function campStock<T extends { key: string; perSheet: number }>(stock: T | null, campId: string | null | undefined, positions: Record<string, number[]>): { stock: T | null; used: number[] } {
  if (!stock) return { stock: null, used: [] };
  const key = `${campId ?? "camp"}/${stock.key}`;
  return { stock: { ...stock, key }, used: cleanUsed(positions[key] ?? positions[stock.key] ?? [], stock.perSheet) };
}

export async function rememberSheetPosition(stock: string, used: number[], userId: string): Promise<void> {
  const clean = [...new Set(used.filter((n) => Number.isInteger(n) && n >= 1 && n <= 500))].sort((a, b) => a - b);
  const { error } = await createAdminClient()
    .from("settings")
    .upsert({ key: `label_sheet:${stock}`, value: { used: clean, at: new Date().toISOString() }, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Above this many tags, requests are emailed with a link only (no PDF), so they can't time out. */
const PDF_MAX_TAGS = 250;
const STUCK_MS = 3 * 60_000;

/**
 * Requests still "making the PDF" minutes after their attempt started were cut off (the
 * server stopped mid-way). Each is tried again once; one whose retry hangs too is marked
 * failed, so the office sees it and can print it from Kinus. Safe to call from several pages
 * at once: a job is claimed with a conditional update, so only one caller retries it.
 */
export async function retryStuckJobs(sessionId: string, appUrl: string, schedule: (fn: () => Promise<void>) => void): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STUCK_MS).toISOString();
  const { data: stuck } = await admin.from("print_jobs").select("id, status, error, requested_at").eq("session_id", sessionId).in("status", ["queued", "rendering"]).lt("requested_at", cutoff).limit(20);
  let n = 0;
  for (const j of stuck ?? []) {
    // when this attempt started: its mark, else when it was asked for
    const markAt = isProgressMark(j.error) ? Date.parse(j.error!.slice(j.error!.startsWith(RETRY_MARK) ? RETRY_MARK.length : STARTED_MARK.length)) : Date.parse(j.requested_at);
    if (Date.now() - markAt < STUCK_MS) continue; // still working
    if (j.error?.startsWith(RETRY_MARK)) {
      await admin
        .from("print_jobs")
        .update({ status: "failed", error: "Making the tags took too long twice. Print it from Kinus (Try again, or Print)." })
        .eq("id", j.id)
        .eq("status", j.status)
        .eq("error", j.error);
      continue;
    }
    let claim = admin.from("print_jobs").update({ status: "queued", error: `${RETRY_MARK}${new Date().toISOString()}` }).eq("id", j.id).eq("status", j.status);
    claim = j.error === null ? claim.is("error", null) : claim.eq("error", j.error);
    const { data: claimed } = await claim.select("id");
    if (!claimed?.length) continue;
    n++;
    schedule(() => processPrintJob(j.id, appUrl, { retry: true }));
  }
  return n;
}
