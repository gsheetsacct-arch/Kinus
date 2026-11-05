"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireAdmin, requireUser } from "@/lib/auth/current-user";
import { isOwner } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { EXTRA_GROUPS, parseExtraFields, type ExtraGroup } from "@/lib/import/extra-fields";
import { forCampers } from "@/lib/print/staff-values";

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

const timeOrNull = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v && /^\d{2}:\d{2}$/.test(v) ? v : null));
const dateOrNull = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null));
const missingRules = z.object({
  percent: z.coerce.number().int().min(0).max(100),
  after_time: timeOrNull,
  after_date: dateOrNull,
  // camps and divisions with their own rule ("camp:<id>" / "div:<id>")
  overrides: z
    .string()
    .optional()
    .transform((v) => {
      try {
        return JSON.parse(v || "[]");
      } catch {
        return [];
      }
    })
    .pipe(
      z
        .array(z.object({ key: z.string().regex(/^(camp|div):[0-9a-f-]{36}$/), percent: z.coerce.number().int().min(0).max(100), after_time: timeOrNull, after_date: dateOrNull }))
        .max(100)
        .transform((list) => list.filter((o, i) => list.findIndex((x) => x.key === o.key) === i)),
    ),
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
    revalidatePath("/status");
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
    const supabase = await createClient();
    const { data: current } = await supabase.from("settings").select("value").eq("key", "extra_fields").maybeSingle();
    const before = parseExtraFields(current?.value);
    const all = columns.map((column, i) => {
        // short answers: the ones on the page, plus any for answers not in this session
        const orig = fd.getAll(`orig:${column}`).map(String);
        const short = fd.getAll(`short:${column}`).map((v) => String(v).trim().slice(0, 60));
        const answers: Record<string, string> = { ...(before.find((f) => f.column === column)?.answers ?? {}) };
        orig.forEach((o, j) => {
          if (short[j]) answers[o] = short[j];
          else delete answers[o];
        });
        const g = String(fd.get(`group:${column}`) ?? "");
        // left out of the form (an older page): keep the choice already made
        const group = fd.has(`group:${column}`) ? ((EXTRA_GROUPS as readonly string[]).includes(g) ? (g as ExtraGroup) : undefined) : before.find((f) => f.column === column)?.group;
        // answers set to Hide (nothing special): the ones ticked here, plus any not in this session
        const had = before.find((f) => f.column === column)?.hide ?? [];
        const hide = [...had.filter((h) => !orig.some((o) => o.trim().toLowerCase() === h.trim().toLowerCase())), ...fd.getAll(`hide:${column}`).map(String)];
        return { column, label: (String(fd.getAll("label")[i] ?? "").trim() || column).slice(0, 80), keep: fd.get(`keep:${column}`) === "on", answers, group, hide };
    });
    const fields = all
      .filter((f) => f.keep)
      .map(({ column, label, answers, group, hide }) => ({ column, label, ...(Object.keys(answers).length ? { answers } : {}), ...(group ? { group } : {}), ...(hide.length ? { hide } : {}) }));
    // every export column shows unless left out: unticked ones are left out (hidden_columns);
    // ticked "Show again" brings one back
    const { data: hiddenRow } = await supabase.from("settings").select("value").eq("key", "hidden_columns").maybeSingle();
    const key = (c: string) => c.trim().toLowerCase().replace(/#/g, ".");
    const unhide = new Set(fd.getAll("unhide").map((v) => key(String(v))));
    const kept = new Set(fields.map((f) => key(f.column)));
    const wasHidden = Array.isArray(hiddenRow?.value) ? (hiddenRow.value as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const hidden = [...wasHidden, ...all.filter((f) => !f.keep).map((f) => f.column)].filter((c, i, list) => !unhide.has(key(c)) && !kept.has(key(c)) && list.findIndex((x) => key(x) === key(c)) === i);
    const [{ error }, { error: e2 }] = await Promise.all([
      supabase.from("settings").upsert({ key: "extra_fields", value: fields, updated_by: me.id, updated_at: new Date().toISOString() }),
      supabase.from("settings").upsert({ key: "hidden_columns", value: hidden, updated_by: me.id, updated_at: new Date().toISOString() }),
    ]);
    if (error) throw error;
    if (e2) throw e2;
    revalidatePath("/", "layout");
    return ok("Saved.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/**
 * Sends a real test to the office: a sample tag made into a PDF (the same way requests are)
 * and emailed. Says exactly what worked and what didn't.
 */
export async function sendTestEmail(): Promise<ActionResult> {
  await requireAdmin();
  try {
    const [{ createAdminClient }, { officeEmail }, { sendEmail, emailSetup }, { renderPdf }, { renderDocument }, { loadMergeSetup, toSpec, backgroundDataUrl }, { mergeValues, SAMPLE_CAMPER }] = await Promise.all([
      import("@/lib/supabase/admin"),
      import("@/lib/print/jobs"),
      import("@/lib/print/email"),
      import("@/lib/print/chromium"),
      import("@/lib/print/render"),
      import("@/lib/print/data"),
      import("@/lib/print/merge"),
    ]);
    const office = await officeEmail();
    if (!office.to) return fail("Set the office email above first (and save it).");
    const setup = emailSetup();
    if (!setup.configured) return fail("Email isn't set up yet: add RESEND_API_KEY in Vercel (Settings → Environment Variables), then redeploy.");
    // a sample tag from the first template in use, made into a PDF like a real request
    const admin = createAdminClient();
    const { data: inUse } = await admin.from("print_templates").select("*").not("name", "like", "(retired)%").order("sort_order").limit(20);
    const templates = (inUse ?? []).filter(forCampers).slice(0, 1);
    let pdf: Buffer | null = null;
    let pdfNote = "No templates yet, so no PDF was attached.";
    if (templates?.[0]) {
      const spec = toSpec(templates[0]);
      const merge = await loadMergeSetup(admin);
      try {
        const { imageDataUrls } = await import("@/lib/print/data");
        const html = renderDocument({ ...spec, sheet_layout: null }, [{ values: mergeValues(SAMPLE_CAMPER as never, merge.fields, merge.maps), copies: 1 }], {
          background: await backgroundDataUrl(admin, spec.background_path),
          images: await imageDataUrls(admin, spec.layers),
          fontCss: await (await import("@/lib/print/custom-fonts")).customFontCss(spec),
        });
        pdf = (await renderPdf(html)).pdf;
        pdfNote = `A sample “${spec.name}” PDF is attached (${Math.max(1, Math.round(pdf.length / 1024))} KB).`;
      } catch (e) {
        pdfNote = `The PDF couldn't be made (${e instanceof Error ? e.message : String(e)}), so requests will arrive without one; the office can still print them from the queue.`;
      }
    }
    const sent = await sendEmail({
      to: office.to.split(/[,;\s]+/).filter(Boolean),
      cc: office.cc,
      subject: "Kinus test email: tag requests reach you",
      html: `<p>This is a test from Kinus Settings. Name tag and luggage tag requests will arrive at this address like this.</p><p>${pdfNote}</p><p>Each request email links to the print queue in Kinus. Printing from there is best: it shows everything waiting, prints requests for the same tag together, and continues a part-used label sheet.</p>`,
      attachments: pdf ? [{ filename: "kinus-test-tag.pdf", content: pdf }] : undefined,
    });
    if (!sent.sent) return fail(`Not sent: ${sent.reason}`);
    return ok(`Test email sent to ${[office.to, ...office.cc].join(", ")}. ${pdfNote} If it doesn't arrive within a few minutes, check the spam folder.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/**
 * The owner starts check-in over (after a practice run, say) for the divisions picked: their
 * campers' check-ins and check-outs in the active session are removed, with the follow-ups
 * (coming later, notes), and those campers are "not here yet" again. Campers, bunks, tags and buzzer numbers stay as they are.
 */
export async function resetAttendance(fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  if (!isOwner(me)) return fail("Only the owner can reset check-ins.");
  if (String(fd.get("confirmText") ?? "").trim() !== "RESET") return fail("Type RESET to confirm.");
  const session = await getActiveSession();
  if (!session) return fail("No active session.");
  try {
    const admin = createAdminClient();
    const { fetchAll } = await import("@/lib/supabase/fetch-all");
    // only the divisions picked (of this session)
    const picked = [...new Set(fd.getAll("division").map(String))];
    if (!picked.length) return fail("Tick the camps or divisions to reset.");
    const { data: divs } = await admin.from("divisions").select("id, name").eq("session_id", session.id).in("id", picked);
    if (!divs?.length || divs.length !== picked.length) return fail("Those divisions aren't in this session. Reload the page and try again.");
    const ids = (await fetchAll((from, to) => admin.from("campers").select("id").eq("session_id", session.id).in("division_id", picked).order("id").range(from, to))).map((c) => c.id);
    let removed = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      // the campers first: they point at their last check-in
      const reset = await admin.from("campers").update({ status: "expected", last_event_id: null }).in("id", chunk).or("status.neq.expected,last_event_id.not.is.null");
      if (reset.error) throw reset.error;
      const events = await admin.from("attendance_events").delete({ count: "exact" }).in("camper_id", chunk);
      if (events.error) throw events.error;
      removed += events.count ?? 0;
      const followups = await admin.from("camper_followups").delete().in("camper_id", chunk);
      if (followups.error) throw followups.error;
    }
    for (const p of ["/", "/status", "/scan", "/campers", "/checkout"]) revalidatePath(p);
    const where = divs.length <= 3 ? divs.map((d) => d.name).join(", ") : `${divs.length} divisions`;
    return ok(`Check-ins reset for ${where}: ${removed.toLocaleString("en-US")} check-ins and check-outs removed, and their ${ids.length.toLocaleString("en-US")} campers are not here yet.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** Which details are protected: regular uploads keep them; only "our corrected copy" changes them. */
export async function saveProtectedColumns(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  try {
    const { parseProtected } = await import("@/lib/import/protected");
    const extra = String(fd.get("more") ?? "")
      .split(/\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    const value = parseProtected({ fields: fd.getAll("field").map(String), columns: [...fd.getAll("column").map(String), ...extra] });
    const supabase = await createClient();
    const { error } = await supabase.from("settings").upsert({ key: "protected_columns", value, updated_by: me.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    revalidatePath("/admin/settings");
    return ok(`Saved: ${value.fields.length + value.columns.length} protected.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}
