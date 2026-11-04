import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessBunk, seesAllCamp, type CurrentUser } from "@/lib/auth/permissions";
import { renderCombined, renderDocument } from "./render";
import { mergeValues, printedNameKeys } from "./merge";
import type { FitNotes } from "./pdf";
import { renderPdf } from "./chromium";
import { sendEmail } from "./email";
import { backgroundDataUrl, byBunkThenName, imageDataUrls, loadMergeSetup, loadPrintCampers, loadPrintCampersBrief, parseOrder, sortFor, toSpec, type PrintOrder } from "./data";
import { contentHash, labelValues, sameContent, templateKeys } from "./content";
import { DIVISION_VALUE, type TemplateSpec } from "./types";
import type { Database } from "@/lib/supabase/database.types";
import { isProgressMark, RETRY_MARK, STARTED_MARK } from "./labels";
import { cleanUsed, sheetStock, usedBefore } from "./sheet-position";
import { campDivisions, templateCamps, templateDivisionIds } from "./template-camps";
import { customFontCss } from "./custom-fonts";
import { pdfArtPaths } from "./pdf-art";
import { forCampers } from "./staff-values";

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
  return new Set(campers.filter((c) => !sameContent(printed.get(c.id)!, keys, labelValues(spec, mergeValues(c, setup.fields, setup.maps)))).map((c) => c.id));
}

/** What each camper's label says right now, as fingerprints (see contentHash). */
export async function labelHashes(db: Parameters<typeof loadPrintCampers>[0], spec: TemplateSpec, camperIds: string[]): Promise<Map<string, string>> {
  const keys = templateKeys(spec);
  const [campers, setup] = await Promise.all([loadPrintCampers(db, camperIds), loadMergeSetup(db)]);
  return new Map(campers.map((c) => [c.id, contentHash(keys, labelValues(spec, mergeValues(c, setup.fields, setup.maps)))]));
}

export async function officeEmail(): Promise<{ to: string; cc: string[] }> {
  const admin = createAdminClient();
  const { data } = await admin.from("settings").select("value").eq("key", "office_email").maybeSingle();
  const v = (data?.value ?? {}) as { to?: string; cc?: string[] };
  return { to: v.to ?? "", cc: v.cc ?? [] };
}

export async function createPrintJob(
  user: CurrentUser,
  opts: { sessionId: string; templateId: string; camperIds: string[]; copies?: number; deliverTo?: string | null; note?: string | null; /** the order it prints in (default by bunk) */ order?: PrintOrder },
): Promise<{ id: string; count: number; copies: number }> {
  const admin = createAdminClient();
  const { data: template } = await admin.from("print_templates").select("*").eq("id", opts.templateId).single();
  if (!template) throw new Error("That template no longer exists.");
  if (!forCampers(template)) throw new Error(`${template.name} is a staff tag: print it from Print → Staff tags.`);
  const ids = [...new Set(opts.camperIds)];
  if (!ids.length) throw new Error("No campers selected.");
  // permission check per camper (all chunks side by side)
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
  const checked = await Promise.all(chunks.map((chunk) => admin.from("campers").select("id, division_id, bunk_id, first_name, last_name").in("id", chunk)));
  for (const { data } of checked) for (const c of data ?? []) if (!canPrintFor(user, c)) throw new Error("You can only request tags for campers in your own division or bunk.");
  // a template for some camps only prints for their campers
  const camps = templateCamps(template);
  if (camps.length) {
    const divisions = templateDivisionIds(template, await campDivisions(admin, opts.sessionId)) ?? [];
    const other = checked.flatMap(({ data }) => data ?? []).find((c) => !c.division_id || !divisions.includes(c.division_id));
    if (other) throw new Error(`${template.name} is only for ${camps.join(" and ")}${checked.flatMap(({ data }) => data ?? []).length > 1 ? `, and ${other.first_name} ${other.last_name} isn't in it` : ""}.`);
  }
  // a tag with the buzzer number: everyone on it needs one first. Numbers are given on purpose
  // (Print → Batch, in division/bunk/name order), never by printing, and kept for good.
  if (JSON.stringify(toSpec(template)).includes("BUZZER")) {
    const without = (await Promise.all(chunks.map((chunk) => admin.from("campers").select("first_name, last_name").in("id", chunk).is("current_buzzer_number", null)))).flatMap(({ data }) => data ?? []);
    if (without.length)
      throw new Error(
        `${without.length === 1 ? `${without[0].first_name} ${without[0].last_name} has` : `${without.length} campers (${without.slice(0, 3).map((c) => `${c.first_name} ${c.last_name}`).join(", ")}${without.length > 3 ? "…" : ""}) have`} no buzzer number yet. A director gives the new ones their numbers on Print → Batch (Buzzer numbers), then print this.`,
      );
  }
  // what each label says now (for "changed since printed"), read while the request is saved
  const hashing = labelHashes(admin, toSpec(template), ids);
  hashing.catch(() => {});
  // empty: the office (whatever its address is when the email goes out)
  const deliver = opts.deliverTo?.trim() || "";
  const { data: job, error } = await admin
    .from("print_jobs")
    // by bunk is the column's default: written only when another order is asked (works before migration 0049)
    .insert({ session_id: opts.sessionId, kind: template.kind, template_id: template.id, deliver_to: deliver, requested_by: user.id, status: "queued", item_count: ids.length, note: opts.note ?? null, ...(opts.order && opts.order !== "bunk" ? { print_order: opts.order } : {}) })
    .select("id")
    .single();
  if (error) throw /print_order/.test(error.message) ? new Error("Printing in another order needs a database update first (migration 0049). Print by bunk for now.") : error;
  // how many of each: as asked, else the template's usual number (migration 0028)
  const copies = Math.min(Math.max(Math.round(opts.copies ?? (Number((template as { copies?: number }).copies) || 1)), 1), 10);
  const hashes = await hashing;
  const inserts: string[][] = [];
  for (let i = 0; i < ids.length; i += 500) inserts.push(ids.slice(i, i + 500));
  const saved = await Promise.all(inserts.map((part) => admin.from("print_job_items").insert(part.map((camper_id) => ({ job_id: job.id, camper_id, copies, content_hash: hashes.get(camper_id) ?? null })))));
  for (const { error: e } of saved) if (e) throw e;
  return { id: job.id, count: ids.length, copies };
}

/** One staff tag in a request: who, the division their tag is for, what it says, how many. */
export type StaffItem = { /** the staff member (profiles.id); not on tags asked for before it was kept */ id?: string; name: string; division: string; values: Record<string, string>; copies: number };

export const parseStaffItems = (v: unknown): StaffItem[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is StaffItem => Boolean(x && typeof x === "object" && typeof (x as StaffItem).values === "object"))
        .map((x) => ({ ...(typeof x.id === "string" ? { id: x.id } : {}), name: String(x.name ?? ""), division: String(x.division ?? ""), values: x.values ?? {}, copies: Math.min(10, Math.max(1, Math.round(Number(x.copies) || 1))) }))
    : [];

/**
 * Staff tags as a request in the print queue (migration 0060): each person's tag as it reads
 * now (or blank badges for a division), saved with the request, printed like a camper request.
 */
export async function createStaffPrintJob(
  user: CurrentUser,
  opts: { sessionId: string; templateId: string; items: StaffItem[]; note?: string | null; order?: PrintOrder },
): Promise<{ id: string; count: number; tags: number }> {
  const admin = createAdminClient();
  const { data: template } = await admin.from("print_templates").select("*").eq("id", opts.templateId).single();
  if (!template) throw new Error("That template no longer exists.");
  // a camper template takes only blank tags this way (its design, no name: to write on)
  if (forCampers(template) && opts.items.some((i) => i.name)) throw new Error(`${template.name} is a camper tag, not a staff one.`);
  if (!opts.items.length) throw new Error("Nobody to print for.");
  const { data: job, error } = await admin
    .from("print_jobs")
    .insert({
      session_id: opts.sessionId,
      kind: template.kind,
      template_id: template.id,
      deliver_to: user.email,
      requested_by: user.id,
      status: "ready",
      item_count: opts.items.length,
      note: opts.note ?? null,
      staff_items: opts.items,
      ...(opts.order && opts.order !== "bunk" ? { print_order: opts.order } : {}),
    } as never)
    .select("id")
    .single();
  if (error) throw /staff_items/.test(error.message) ? new Error("Staff tags in the queue need a database update first (migration 0060).") : error;
  return { id: (job as { id: string }).id, count: opts.items.length, tags: opts.items.reduce((n, i) => n + i.copies, 0) };
}

/** A blank camper tag: a division's design (its pictures), nothing filled in, no QR or code: to write on. */
export const blankCamperItems = (division: string, count: number): StaffItem[] =>
  Array.from({ length: Math.min(300, Math.max(0, count)) }, () => ({ name: "", division, values: { [DIVISION_VALUE]: division }, copies: 1 }));

/** A staff tag in a print set, shaped like a camper (to sort, count by division and print). */
const staffAsCamper = (s: StaffItem & { id: string }) =>
  ({
    id: s.id,
    first_name: s.values.FIRST ?? s.name,
    last_name: s.values.LAST ?? "",
    division_id: s.division ? `staff:${s.division}` : null,
    division_name: s.division || null,
    division_color: s.values.DIVISION_COLOR ?? null,
    bunk_name: s.values.BUNK || null,
    division_language: null,
    staffValues: s.values,
  }) as unknown as Awaited<ReturnType<typeof loadPrintCampers>>[number] & { staffValues: Record<string, string> };

type PrintSet = Awaited<ReturnType<typeof loadPrintSet>>;

/** The requests, their template and who's on them (camper → most copies asked), checked to print as one. */
async function loadRequests(jobIds: string[]) {
  const admin = createAdminClient();
  const ids = [...new Set(jobIds)];
  if (!ids.length) throw new Error("Nothing to print.");
  const { inChunks } = await import("@/lib/supabase/in-chunks");
  const { fetchAll } = await import("@/lib/supabase/fetch-all");
  const [jobs, items] = await Promise.all([
    inChunks(ids, (c) => admin.from("print_jobs").select("*, print_templates(*), profiles:requested_by(full_name)").in("id", c)),
    inChunks(ids, (c) => fetchAll((from, to) => admin.from("print_job_items").select("camper_id, copies, job_id").in("job_id", c).order("job_id").order("camper_id").range(from, to))),
  ]);
  if (!jobs || jobs.length !== ids.length) throw new Error("Some of these requests are gone. Go back to the print queue.");
  const templateIds = new Set(jobs.map((j) => j.template_id));
  if (templateIds.size > 1) throw new Error("Only requests for the same tag can be printed together.");
  const template = jobs[0].print_templates;
  if (!template) throw new Error("The template for this job was deleted.");
  const spec = toSpec(template as never);
  const copiesOf = new Map<string, number>();
  for (const i of items) copiesOf.set(i.camper_id, Math.max(copiesOf.get(i.camper_id) ?? 0, i.copies));
  // staff tag requests (migration 0060): their people are saved with the request
  const staffJobs = jobs.filter((j) => Array.isArray((j as { staff_items?: unknown }).staff_items));
  if (staffJobs.length && staffJobs.length !== jobs.length) throw new Error("Staff tags and camper tags can't be printed together.");
  const staff = staffJobs.length ? staffJobs.flatMap((j) => parseStaffItems((j as { staff_items?: unknown }).staff_items).map((s, i) => ({ ...s, id: `staff:${j.id}:${i}` }))) : null;
  for (const s of staff ?? []) copiesOf.set(s.id, s.copies);
  return { admin, jobs, spec, copiesOf, staff, askedMoreThanOnce: items.length > copiesOf.size && !staff };
}

/**
 * One or more requests for the same template, as one thing to print. A camper asked for in
 * two requests (a double tap, or two people asking) prints once, with the most copies asked.
 */
async function loadPrintSet(jobIds: string[]) {
  const { admin, jobs, spec, copiesOf, askedMoreThanOnce, staff } = await loadRequests(jobIds);
  const [campers, setup, background, images, fontCss, art] = await Promise.all([
    staff ? Promise.resolve(staff.map(staffAsCamper)) : loadPrintCampers(admin, [...copiesOf.keys()]),
    loadMergeSetup(admin),
    backgroundDataUrl(admin, spec.background_path),
    imageDataUrls(admin, spec.layers),
    customFontCss(spec),
    // uploaded PDF artwork, for PDFs made with it as it is
    pdfArtPaths(spec.layers),
  ]);
  campers.sort(byBunkThenName);
  return { jobs, spec, campers, copiesOf, setup, background, images, fontCss, art, askedMoreThanOnce, order: savedOrder(jobs) };
}

const divisionOf = (c: { division_id?: string | null }) => c.division_id ?? null;

/** The order the request was asked to print in (the first one's, for several printed together). */
const savedOrder = (jobs: { print_order?: string | null }[]): PrintOrder => parseOrder(jobs[0]?.print_order);

type SetOpts = { /** by bunk (default), division or last name */ order?: PrintOrder; start?: number; used?: number[]; divisionId?: string | null; copies?: number; /** each tag on a page of its own (not on the template's label sheet) */ single?: boolean };

/** The template as printed: on its label sheet, or one tag a page (pages the tag's size). */
const specFor = (set: PrintSet, opts: SetOpts): TemplateSpec => (opts.single ? { ...set.spec, sheet_layout: null } : set.spec);

/** The campers printed (all, or one division) and how many of each. */
function itemsOf(set: PrintSet, opts: SetOpts) {
  const picked = opts.divisionId === undefined ? set.campers : set.campers.filter((c) => divisionOf(c as never) === opts.divisionId);
  // another order when asked (on the print page), else the one the request was made with
  const order = opts.order ?? set.order;
  // a staff tag says what it said when asked for; a camper's tag is filled now
  const values = new Map(picked.map((c) => [c.id, (c as { staffValues?: Record<string, string> }).staffValues ?? mergeValues(c, set.setup.fields, set.setup.maps)]));
  // sorted by the names the tags print (a template's last name may read another export column
  // than the camper's last name in Kinus), falling back to Kinus' own: in a Hebrew or French
  // division (its language) the Hebrew name, elsewhere (and by last name across camp) the English
  const keys = printedNameKeys(set.spec, set.setup.fields);
  // a stray space, quote or invisible mark before a name doesn't move it ("'Ohana" sorts with the O's)
  const clean = (v: string | undefined) => (v ?? "").replace(/^[^\p{L}\p{N}]+/u, "");
  const printed = (c: (typeof picked)[number]) => {
    const v = values.get(c.id)!;
    const hebLast = order !== "name" && (c.division_language === "he" || c.division_language === "fr") && keys.hebLast ? clean(v[keys.hebLast]) : "";
    // a "Hebrew" last name typed in English letters ("Djian") sorts with the English ones, after
    if (hebLast && /[\u05D0-\u05EA]/.test(hebLast)) return { ...c, last_name: hebLast, first_name: clean(keys.hebFirst ? v[keys.hebFirst] : "") || clean(c.first_name), heb: true };
    return { ...c, last_name: clean(keys.last ? v[keys.last] : "") || clean(c.last_name), first_name: clean(keys.first ? v[keys.first] : "") || clean(c.first_name), heb: false };
  };
  const cmp = sortFor(order);
  const campers = picked.map((c) => ({ c, s: printed(c) })).sort((a, b) => cmp(a.s, b.s)).map((x) => x.c);
  // copies: as asked, or the same number of each chosen when printing
  const copiesOf = (id: string) => (opts.copies ? Math.min(10, Math.max(1, Math.round(opts.copies))) : (set.copiesOf.get(id) ?? 1));
  return { campers, items: campers.map((c) => ({ values: values.get(c.id)!, copies: copiesOf(c.id) })) };
}

function setHtml(set: PrintSet, opts: SetOpts & { tags?: [number, number] }) {
  const spec = specFor(set, opts);
  const stock = sheetStock(spec);
  const made = itemsOf(set, opts);
  const campers = made.campers;
  let items = made.items;
  // copies of one camper stack down a column of the label sheet (across, when they fill whole rows)
  const stack = Math.max(1, ...items.map((i) => i.copies));
  // one part of a big PDF: tags from..to (whole sheets, so no labels are skipped between parts)
  if (opts.tags) items = items.flatMap((i) => Array.from({ length: i.copies }, () => ({ values: i.values, copies: 1 }))).slice(...opts.tags);
  const html = renderDocument(spec, items, {
    background: set.background,
    images: set.images,
    fontCss: set.fontCss,
    stack,
    usedSlots: stock && !opts.tags?.[0] ? (opts.used ?? (opts.start ? usedBefore(opts.start, stock.perSheet) : [])) : [],
  });
  return { html, campers };
}

/** The printable page for requests printed together (all, or one division), starting at a label on a part-used sheet. */
export async function printSetHtml(jobIds: string[], opts: SetOpts = {}): Promise<string> {
  return setHtml(await loadPrintSet(jobIds), opts).html;
}

/**
 * The print page as a PDF to download, one part of it at a time (a server run may only take a
 * minute; the browser joins the parts). Parts are whole sheets: the first is shorter by the
 * labels already used on a part-used sheet, so nothing shifts between parts.
 */
export async function printSetPdf(jobIds: string[], opts: SetOpts & { part?: number } = {}): Promise<{ pdf: Buffer; parts: number; fileName: string }> {
  const set = await loadPrintSet(jobIds);
  const spec = specFor(set, opts);
  const stock = sheetStock(spec);
  const total = itemsOf(set, opts).items.reduce((n, i) => n + i.copies, 0);
  if (total > PDF_MAX_TAGS) throw new Error(`More than ${PDF_MAX_TAGS.toLocaleString("en-US")} tags in one PDF: download one division at a time.`);
  const size = tagsPerPart(spec);
  const usedCount = stock ? (opts.used ? cleanUsed(opts.used, stock.perSheet) : opts.start ? usedBefore(opts.start, stock.perSheet) : []).length : 0;
  const first = size - usedCount;
  const parts = total <= first ? 1 : 1 + Math.ceil((total - first) / size);
  const part = Math.min(parts - 1, Math.max(0, Math.floor(opts.part ?? 0)));
  const tags: [number, number] | undefined = parts === 1 ? undefined : part === 0 ? [0, first] : [first + (part - 1) * size, first + part * size];
  const { pdf } = await renderPdf(setHtml(set, { ...opts, tags }).html, { art: set.art });
  // "×" (4×6) as "x": some browsers drop a download's name with it
  const fileName = `${spec.name.replace(/×/g, "x").replace(/[\\/:*?"<>|]+/g, "-").trim() || "Tags"} - ${total} ${total === 1 ? "tag" : "tags"}.pdf`;
  return { pdf, parts, fileName };
}

/** What a set of requests holds: the template, its label stock, and the tags per division. */
export async function printSetSummary(jobIds: string[]) {
  // only counts and divisions: not every camper's whole record, background or merge fields
  const req = await loadRequests(jobIds);
  const campers = req.staff ? req.staff.map(staffAsCamper) : await loadPrintCampersBrief(req.admin, [...req.copiesOf.keys()]);
  campers.sort(byBunkThenName);
  const order = savedOrder(req.jobs);
  const set = { ...req, campers };
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
    /** the order it was asked to print in */
    order,
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

/** Tags in one part of a big PDF: each part is made in its own short server run (whole label sheets). */
const PART_TAGS = 200;
/** Above this many tags no PDF is made (the email links to the print queue). */
const PDF_MAX_TAGS = 3000;
/** Resend takes up to 40 MB an email; a bigger PDF is linked instead of attached. */
const ATTACH_MAX_BYTES = 30 * 1024 * 1024;

const tagsPerPart = (spec: TemplateSpec) => {
  const per = sheetStock(spec)?.perSheet ?? 1;
  return Math.max(per, Math.floor(PART_TAGS / per) * per);
};

/** Builds the printable HTML for a job (used by the PDF, the browser print page and previews), or one part of it. */
export async function jobHtml(jobId: string, opts: { start?: number; part?: number } = {}) {
  const set = await loadPrintSet([jobId]);
  const job = set.jobs[0];
  const copiesOf = set.copiesOf;
  const tags = set.campers.reduce((n, c) => n + (copiesOf.get(c.id) ?? 1), 0);
  const per = tagsPerPart(set.spec);
  const parts = Math.max(1, Math.ceil(tags / per));
  const { html, campers } = setHtml(set, { start: opts.start, tags: opts.part === undefined || parts === 1 ? undefined : [opts.part * per, (opts.part + 1) * per] });
  const first = campers[0];
  return {
    html,
    parts,
    art: set.art,
    job: {
      id: job.id,
      deliver_to: job.deliver_to,
      template_name: set.spec.name,
      count: campers.length,
      tags,
      requested_by_name: (job.profiles as { full_name: string } | null)?.full_name ?? "someone",
      first_camper: first ? `${first.first_name} ${first.last_name}${first.bunk_name ? ` · ${first.bunk_name}` : ""}` : "",
      // who the tags are for (the first few), for the email
      campers: campers.slice(0, 12).map((c) => `${c.first_name} ${c.last_name}${[c.division_name, c.bunk_name].filter(Boolean).length ? ` (${[c.division_name, c.bunk_name].filter(Boolean).join(" · ")})` : ""}${(copiesOf.get(c.id) ?? 1) > 1 ? ` × ${copiesOf.get(c.id)}` : ""}`),
      note: job.note ?? null,
    },
  };
}

/** Proof that a "make the next part" call comes from Kinus itself (signed with the server's own key). */
export function partToken(jobId: string, part: number, mark: string, base: string): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update(`print-part|${jobId}|${part}|${mark}|${base}`).digest("hex");
}
export function validPartToken(token: string, jobId: string, part: number, mark: string, base: string): boolean {
  const want = Buffer.from(partToken(jobId, part, mark, base));
  const got = Buffer.from(String(token));
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) && want.length === got.length && timingSafeEqual(want, got);
}

const partPath = (jobId: string, part: number) => `${jobId}-part${part}.pdf`;
const fitPath = (jobId: string, part: number) => `${jobId}-part${part}.json`;

/**
 * Renders a job to PDF, stores it, and emails the office. Never throws: the outcome is
 * written to the job (ready / sent / failed) so the print queue always shows it.
 *
 * A big job is made in parts of about 200 tags, each in its own server run (a run may only
 * take a minute): a part is stored, then the next part is started (/api/cron/print-part),
 * and the last one joins them into one PDF and sends the email. Each part renews the
 * request's "started at" mark, so a part that's still working is never taken for stuck.
 */
export async function processPrintJob(jobId: string, appUrl: string, opts: { retry?: boolean; part?: number; mark?: string } = {}): Promise<void> {
  const admin = createAdminClient();
  const part = opts.part ?? 0;
  // claim this attempt (or this part of it): it says when it started (so a cut-off one can be
  // found) and never touches a request that was printed, cancelled or retried in the meantime
  const prefix = opts.mark ? (opts.mark.startsWith(RETRY_MARK) ? RETRY_MARK : STARTED_MARK) : opts.retry ? RETRY_MARK : STARTED_MARK;
  const mark = `${prefix}${new Date().toISOString()}`;
  const claim = part === 0 && !opts.mark
    ? admin.from("print_jobs").update({ status: "rendering", error: mark }).eq("id", jobId).in("status", ["queued", "rendering"])
    : admin.from("print_jobs").update({ error: mark }).eq("id", jobId).eq("status", "rendering").eq("error", opts.mark ?? "");
  const { data: claimed } = await claim.select("id");
  if (!claimed?.length) return;
  // the outcome is written only if this attempt still owns the request
  const finish = (patch: Database["public"]["Tables"]["print_jobs"]["Update"]) => admin.from("print_jobs").update(patch).eq("id", jobId).eq("status", "rendering").eq("error", mark);
  try {
    const { html, job, parts, art } = await jobHtml(jobId, { part });
    let pdf: Buffer | null = null;
    let pdfError: string | null = null;
    let fit: FitNotes | null = null;
    try {
      if (job.tags > PDF_MAX_TAGS) throw new Error(`more than ${PDF_MAX_TAGS.toLocaleString("en-US")} tags; print it from Kinus`);
      const r = await renderPdf(html, { art, base: appUrl });
      const made = r.pdf;
      fit = r.fit;
      if (parts > 1) {
        const out = admin.storage.from("print-output");
        const saved = await Promise.all([
          out.upload(partPath(jobId, part), made, { contentType: "application/pdf", upsert: true }),
          out.upload(fitPath(jobId, part), Buffer.from(JSON.stringify(fit ?? { smaller: [], cut: [] })), { contentType: "application/json", upsert: true }),
        ]);
        for (const { error } of saved) if (error) throw error;
        if (part < parts - 1) {
          // the next part, in a run of its own; this run ends here
          const next = { job: jobId, part: part + 1, mark, base: appUrl };
          const res = await fetch(`${appUrl}/api/cron/print-part`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...next, token: partToken(jobId, next.part, mark, appUrl) }),
            signal: AbortSignal.timeout(20_000),
          }).catch((e: unknown) => e);
          if (res instanceof Response && res.ok) return;
          throw new Error(`part ${part + 2} of ${parts} couldn't be started (${res instanceof Response ? `answer ${res.status}` : res instanceof Error ? res.message : String(res)})`);
        }
        // the last part: join them all into one PDF
        const files = await Promise.all(Array.from({ length: parts }, (_, i) => Promise.all([out.download(partPath(jobId, i)), out.download(fitPath(jobId, i))])));
        const { PDFDocument } = await import("pdf-lib");
        const joined = await PDFDocument.create();
        const notes: FitNotes = { smaller: [], cut: [] };
        for (const [{ data: p, error }, { data: f }] of files) {
          if (!p) throw error ?? new Error("a part of the PDF went missing");
          const doc = await PDFDocument.load(await p.arrayBuffer());
          for (const page of await joined.copyPages(doc, doc.getPageIndices())) joined.addPage(page);
          const n = f ? (JSON.parse(await f.text()) as FitNotes) : null;
          notes.smaller.push(...(n?.smaller ?? []));
          notes.cut.push(...(n?.cut ?? []));
        }
        pdf = Buffer.from(await joined.save());
        fit = notes;
        await out.remove(Array.from({ length: parts }, (_, i) => [partPath(jobId, i), fitPath(jobId, i)]).flat());
      } else pdf = made;
      const { error } = await admin.storage.from("print-output").upload(`${jobId}.pdf`, pdf, { contentType: "application/pdf", upsert: true });
      if (error) throw error;
      await admin.from("print_jobs").update({ pdf_path: `${jobId}.pdf` }).eq("id", jobId);
    } catch (e) {
      pdfError = `PDF could not be made (${e instanceof Error ? e.message : String(e)}). Print it from the queue instead.`;
      pdf = null;
    }
    // a PDF too big to attach is downloaded from Kinus instead
    const attach = pdf && pdf.length <= ATTACH_MAX_BYTES ? pdf : null;
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
      html: requestEmailHtml({ ...job, link, queueLink: `${appUrl}/print`, attached: Boolean(attach), pdfLink: pdf && !attach ? `${link}/pdf` : null, fit }),
      attachments: attach ? [{ filename: `${job.template_name.replace(/[^\w-]+/g, "-")}-${jobId.slice(0, 8)}.pdf`, content: attach }] : undefined,
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
export function requestEmailHtml(j: { requested_by_name: string; count: number; template_name: string; campers: string[]; note: string | null; link: string; queueLink: string; attached: boolean; pdfLink?: string | null; fit?: FitNotes | null }): string {
  const list = j.campers.map((c) => `<li dir="auto">${escHtml(c)}</li>`).join("");
  // a long name that went under the template's smallest size, so it prints whole: worth a look
  const uniq = <T,>(xs: T[], key: (x: T) => string) => [...new Map(xs.map((x) => [key(x), x])).values()];
  const smaller = uniq(j.fit?.smaller ?? [], (x) => x.text);
  const cut = uniq(j.fit?.cut ?? [], (x) => x);
  const fitNote =
    smaller.length || cut.length
      ? `<p style="margin:0 0 16px;padding:8px 12px;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;font-size:14px">${
          smaller.length
            ? `<strong>Printed smaller to fit:</strong> ${smaller
                .slice(0, 8)
                .map((x) => `<span dir="auto">${escHtml(x.text)}</span> (${x.pt} pt)`)
                .join(", ")}${smaller.length > 8 ? ` and ${smaller.length - 8} more` : ""}. They're longer than the template was made for; check they're easy to read, or make that part of the template bigger.`
            : ""
        }${cut.length ? `${smaller.length ? "<br>" : ""}<strong>Too long to fit even at the smallest print:</strong> ${cut.slice(0, 8).map((x) => `<span dir="auto">${escHtml(x)}</span>`).join(", ")}. Make that part of the template bigger, then print these again.` : ""}</p>`
      : "";
  const more = j.count > j.campers.length ? `<li>and ${j.count - j.campers.length} more</li>` : "";
  const button = "display:inline-block;background:#0f5f8a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold";
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px">
<p><strong>${escHtml(j.requested_by_name)}</strong> asked for <strong>${j.count} × ${escHtml(j.template_name)}</strong>${j.note ? ` (${escHtml(j.note)})` : ""}.</p>
${list ? `<ul style="padding-left:20px;margin:0 0 16px">${list}${more}</ul>` : ""}
${fitNote}
<p style="margin:0 0 8px"><a href="${escHtml(j.queueLink)}" style="${button}">Open the print queue in Kinus</a></p>
<p style="margin:0 0 16px;font-size:13px"><a href="${escHtml(j.link)}" style="color:#0f5f8a">or just this request</a></p>
<p style="margin:0 0 6px"><strong>Please print from Kinus rather than from this email:</strong></p>
<ul style="padding-left:20px;margin:0 0 16px">
<li><strong>Everything waiting, in one place.</strong> Other requests may have come in since this one: the queue shows them all.</li>
<li><strong>Fewer prints.</strong> Requests for the same tag print together in one go, sorted by division and bunk, or one division at a time.</li>
<li><strong>No wasted label sheets.</strong> Kinus remembers how much of the label sheet is used and starts on the next free label. This PDF always starts at the top of a fresh sheet.</li>
<li><strong>Staff can see it's done.</strong> Marking it printed shows on the camper's card, so nobody asks twice.</li>
</ul>
<p style="color:#666;font-size:13px">${j.attached ? "The PDF is attached in case you can't open Kinus right now." : j.pdfLink ? `The PDF is too big to attach: <a href="${escHtml(j.pdfLink)}" style="color:#0f5f8a">download it from Kinus</a>.` : "There's no PDF this time: print it from Kinus."}</p>
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

/**
 * Requests for different label-printer templates (a name tag and a bag label, each camper's
 * asked for at check-in) printed as sets: each camper's labels one after another, in the
 * order asked for (by bunk unless chosen), the templates in their usual order.
 */
async function combinedSet(jobIds: string[], opts: { order?: PrintOrder } = {}) {
  const admin = createAdminClient();
  const ids = [...new Set(jobIds)];
  const { inChunks } = await import("@/lib/supabase/in-chunks");
  const jobs = await inChunks(ids, (c) => admin.from("print_jobs").select("id, template_id, print_templates(sort_order, name)").in("id", c));
  if (!jobs || jobs.length !== ids.length) throw new Error("Some of these requests are gone. Go back to the print queue.");
  const byTemplate = new Map<string, { ids: string[]; sort: number; name: string }>();
  for (const j of jobs) {
    if (!j.template_id) throw new Error("The template of one of these requests was deleted.");
    const t = j.print_templates as { sort_order: number | null; name: string } | null;
    const g = byTemplate.get(j.template_id) ?? { ids: [], sort: t?.sort_order ?? 0, name: t?.name ?? "" };
    g.ids.push(j.id);
    byTemplate.set(j.template_id, g);
  }
  const groups = [...byTemplate.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const sets = await Promise.all(groups.map((g) => loadPrintSet(g.ids)));
  const made = sets.map((set) => itemsOf(set, { order: opts.order }));
  // the campers in the first template's order, then anyone only in the others
  const campers: string[] = [];
  for (const m of made) for (const c of m.campers) if (!campers.includes(c.id)) campers.push(c.id);
  const order = campers.flatMap((id) =>
    made.flatMap((m, part) => {
      const i = m.campers.findIndex((c) => c.id === id);
      return i < 0 ? [] : [{ part, values: m.items[i].values, copies: m.items[i].copies }];
    }),
  );
  const parts = sets.map((set) => ({ spec: set.spec, background: set.background, images: set.images, fontCss: set.fontCss }));
  return { parts, order, art: sets.flatMap((s) => s.art), tags: order.reduce((n, o) => n + o.copies, 0), campers: campers.length, templates: groups.map((g) => g.name) };
}

/** The printable page for a combined set (see combinedSet). */
export async function combinedSetHtml(jobIds: string[], opts: { order?: PrintOrder } = {}): Promise<string> {
  const c = await combinedSet(jobIds, opts);
  return renderCombined(c.parts, c.order);
}

/** A combined set as one PDF (up to a few hundred labels: bigger sets print from the page). */
export async function combinedSetPdf(jobIds: string[], opts: { order?: PrintOrder; /** 1, 2…: that part of a big set, COMBINED_PDF_PART labels each */ part?: number } = {}): Promise<{ pdf: Buffer; fileName: string }> {
  const c = await combinedSet(jobIds, opts);
  let order = c.order;
  let suffix = "";
  if (opts.part) {
    // each copy on its own, so a part ends at a label (a camper's set may run into the next part)
    const one = order.flatMap((o) => Array.from({ length: Math.max(1, o.copies) }, () => ({ ...o, copies: 1 })));
    order = one.slice((opts.part - 1) * COMBINED_PDF_PART, opts.part * COMBINED_PDF_PART);
    if (!order.length) throw new Error("That part is empty: the set is smaller now. Go back to the print queue.");
    suffix = ` - part ${opts.part} of ${Math.ceil(one.length / COMBINED_PDF_PART)}`;
  } else if (c.tags > COMBINED_PDF_PART) throw new Error(`${c.tags} labels is too many for one PDF: download it in parts, or print from the page.`);
  const { pdf } = await renderPdf(renderCombined(c.parts, order), { art: c.art });
  return { pdf, fileName: `${c.templates.join(" + ").replace(/[\\/:*?"<>|×]+/g, "-")} - ${c.campers} campers${suffix}.pdf` };
}

/** Labels in one PDF of a combined set (bigger sets download in parts). */
export const COMBINED_PDF_PART = 400;
