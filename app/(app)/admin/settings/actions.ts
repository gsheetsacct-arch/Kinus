"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { parseExtraFields } from "@/lib/import/extra-fields";

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

const missingRules = z.object({
  percent: z.coerce.number().int().min(0).max(100),
  after_time: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && /^\d{2}:\d{2}$/.test(v) ? v : null)),
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
    revalidatePath("/missing");
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
    const fields = columns
      .map((column, i) => {
        // short answers: the ones on the page, plus any for answers not in this session
        const orig = fd.getAll(`orig:${column}`).map(String);
        const short = fd.getAll(`short:${column}`).map((v) => String(v).trim().slice(0, 60));
        const answers: Record<string, string> = { ...(before.find((f) => f.column === column)?.answers ?? {}) };
        orig.forEach((o, j) => {
          if (short[j]) answers[o] = short[j];
          else delete answers[o];
        });
        return { column, label: (String(fd.getAll("label")[i] ?? "").trim() || column).slice(0, 80), keep: fd.get(`keep:${column}`) === "on", answers };
      })
      .filter((f) => f.keep)
      .map(({ column, label, answers }) => ({ column, label, ...(Object.keys(answers).length ? { answers } : {}) }));
    const { error } = await supabase.from("settings").upsert({ key: "extra_fields", value: fields, updated_by: me.id, updated_at: new Date().toISOString() });
    if (error) throw error;
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
    const [{ createAdminClient }, { officeEmail }, { sendEmail, emailSetup }, { htmlToPdf }, { renderDocument }, { loadMergeSetup, toSpec, backgroundDataUrl }, { mergeValues, SAMPLE_CAMPER }] = await Promise.all([
      import("@/lib/supabase/admin"),
      import("@/lib/print/jobs"),
      import("@/lib/print/email"),
      import("@/lib/print/pdf"),
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
    const { data: templates } = await admin.from("print_templates").select("*").not("name", "like", "(retired)%").order("sort_order").limit(1);
    let pdf: Buffer | null = null;
    let pdfNote = "No templates yet, so no PDF was attached.";
    if (templates?.[0]) {
      const spec = toSpec(templates[0]);
      const merge = await loadMergeSetup(admin);
      try {
        const html = renderDocument({ ...spec, sheet_layout: null }, [{ values: mergeValues(SAMPLE_CAMPER as never, merge.fields, merge.maps), copies: 1 }], { background: await backgroundDataUrl(admin, spec.background_path) });
        pdf = await htmlToPdf(html);
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
