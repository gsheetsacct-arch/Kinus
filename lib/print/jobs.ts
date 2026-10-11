import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessBunk, seesAllCamp, type CurrentUser } from "@/lib/auth/permissions";
import { renderDocument } from "./render";
import { mergeValues } from "./merge";
import { htmlToPdf } from "./pdf";
import { sendEmail } from "./email";
import { backgroundDataUrl, byBunkThenName, loadMergeSetup, loadPrintCampers, toSpec } from "./data";

/** Office, directors and admins print for anyone; others need check-in access to the camper. */
export function canPrintFor(user: CurrentUser, camper: { division_id: string | null; bunk_id: string | null }) {
  // the office and logistics (bus tags) print for anyone in their area, even with view access
  if (user.role === "office" || user.role === "logistics" || user.role === "owner") return seesAllCamp(user) || (camper.division_id ? canAccessBunk(user, camper.division_id, camper.bunk_id, "view") : false);
  if (user.role === "director") return camper.division_id ? canAccessBunk(user, camper.division_id, camper.bunk_id, "view") : seesAllCamp(user);
  return camper.division_id ? canAccessBunk(user, camper.division_id, camper.bunk_id, "scan") : false;
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
): Promise<{ id: string; count: number }> {
  const admin = createAdminClient();
  const { data: template } = await admin.from("print_templates").select("id, kind").eq("id", opts.templateId).single();
  if (!template) throw new Error("That template no longer exists.");
  const ids = [...new Set(opts.camperIds)];
  if (!ids.length) throw new Error("No campers selected.");
  // permission check per camper
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await admin.from("campers").select("id, division_id, bunk_id").in("id", ids.slice(i, i + 150));
    for (const c of data ?? []) if (!canPrintFor(user, c)) throw new Error("You can only request tags for campers in your own division or bunk.");
  }
  const deliver = opts.deliverTo?.trim() || (await officeEmail()).to || "";
  const { data: job, error } = await admin
    .from("print_jobs")
    .insert({ session_id: opts.sessionId, kind: template.kind, template_id: template.id, deliver_to: deliver, requested_by: user.id, status: "queued", item_count: ids.length, note: opts.note ?? null })
    .select("id")
    .single();
  if (error) throw error;
  const copies = Math.min(Math.max(opts.copies ?? 1, 1), 10);
  for (let i = 0; i < ids.length; i += 500) {
    const { error: e } = await admin.from("print_job_items").insert(ids.slice(i, i + 500).map((camper_id) => ({ job_id: job.id, camper_id, copies })));
    if (e) throw e;
  }
  return { id: job.id, count: ids.length };
}

/** Builds the printable HTML for a job (used by the PDF, the browser print page and previews). */
export async function jobHtml(jobId: string): Promise<{ html: string; job: { id: string; deliver_to: string; template_name: string; count: number; requested_by_name: string; first_camper: string } }> {
  const admin = createAdminClient();
  const { data: job, error } = await admin.from("print_jobs").select("*, print_templates(*), profiles:requested_by(full_name)").eq("id", jobId).single();
  if (error || !job) throw error ?? new Error("Job not found.");
  if (!job.print_templates) throw new Error("The template for this job was deleted.");
  const spec = toSpec(job.print_templates as never);
  const items = await import("@/lib/supabase/fetch-all").then(({ fetchAll }) =>
    fetchAll((from, to) => admin.from("print_job_items").select("camper_id, copies").eq("job_id", jobId).order("camper_id").range(from, to)),
  );
  const [campers, setup, bg] = await Promise.all([loadPrintCampers(admin, items.map((i) => i.camper_id)), loadMergeSetup(admin), backgroundDataUrl(admin, spec.background_path)]);
  campers.sort(byBunkThenName);
  const copiesOf = new Map(items.map((i) => [i.camper_id, i.copies]));
  const html = renderDocument(
    spec,
    campers.map((c) => ({ values: mergeValues(c, setup.fields, setup.maps), copies: copiesOf.get(c.id) ?? 1 })),
    { background: bg },
  );
  const first = campers[0];
  return {
    html,
    job: {
      id: job.id,
      deliver_to: job.deliver_to,
      template_name: spec.name,
      count: campers.length,
      requested_by_name: (job.profiles as { full_name: string } | null)?.full_name ?? "someone",
      first_camper: first ? `${first.first_name} ${first.last_name}${first.bunk_name ? ` · ${first.bunk_name}` : ""}` : "",
    },
  };
}

/**
 * Renders a job to PDF, stores it, and emails the office. Never throws: the outcome is
 * written to the job (ready / sent / failed) so the print queue always shows it.
 */
export async function processPrintJob(jobId: string, appUrl: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("print_jobs").update({ status: "rendering", error: null }).eq("id", jobId);
  try {
    const { html, job } = await jobHtml(jobId);
    let pdf: Buffer | null = null;
    let pdfError: string | null = null;
    try {
      pdf = await htmlToPdf(html);
      const { error } = await admin.storage.from("print-output").upload(`${jobId}.pdf`, pdf, { contentType: "application/pdf", upsert: true });
      if (error) throw error;
      await admin.from("print_jobs").update({ pdf_path: `${jobId}.pdf` }).eq("id", jobId);
    } catch (e) {
      pdfError = `PDF could not be made (${e instanceof Error ? e.message : String(e)}). Print it from the queue instead.`;
      pdf = null;
    }
    const link = `${appUrl}/print/jobs/${jobId}`;
    const subject = job.count === 1 ? `${job.template_name} · ${job.first_camper} · from ${job.requested_by_name}` : `${job.template_name} × ${job.count} · from ${job.requested_by_name}`;
    const office = await officeEmail();
    const to = (job.deliver_to || office.to).split(/[,;\s]+/).filter(Boolean);
    if (!to.length) {
      await admin.from("print_jobs").update({ status: "ready", error: pdfError ?? "No office email set, so it waits in the print queue." }).eq("id", jobId);
      return;
    }
    const sent = await sendEmail({
      to,
      cc: job.deliver_to && job.deliver_to !== office.to ? [] : office.cc,
      subject,
      html: `<p>${job.requested_by_name} asked for <strong>${job.count} × ${job.template_name}</strong>.</p><p>${pdf ? "The PDF is attached." : "Open the link to print it."}</p><p><a href="${link}">Open in Kinus</a> to print again or mark it printed.</p>`,
      attachments: pdf ? [{ filename: `${job.template_name.replace(/[^\w-]+/g, "-")}-${jobId.slice(0, 8)}.pdf`, content: pdf }] : undefined,
    });
    if (sent.sent) await admin.from("print_jobs").update({ status: "sent", email_message_id: sent.id, error: pdfError }).eq("id", jobId);
    else await admin.from("print_jobs").update({ status: "ready", error: [pdfError, sent.reason].filter(Boolean).join(" ") }).eq("id", jobId);
  } catch (e) {
    await admin.from("print_jobs").update({ status: "failed", error: e instanceof Error ? e.message : String(e) }).eq("id", jobId);
  }
}
