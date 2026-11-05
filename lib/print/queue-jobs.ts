import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { QueueJob } from "@/components/print/print-queue";
import { shownJobError } from "./labels";

/** A print request as the queue reads it (the fields queueJobs needs). */
export const QUEUE_JOB_FIELDS = "id, status, item_count, requested_at, deliver_to, error, pdf_path, printed_at, note, template_id, print_templates(name), requester:requested_by(full_name), printer:printed_by(full_name)";

type Row = {
  id: string;
  status: string;
  item_count: number;
  requested_at: string;
  deliver_to: string;
  error: string | null;
  pdf_path: string | null;
  printed_at: string | null;
  note: string | null;
  template_id: string | null;
  print_templates: unknown;
  requester: unknown;
  printer: unknown;
};

/**
 * The queue's rows for these requests: who a small request is for (names, where, code), how
 * many labels each prints (copies added up, staff requests' too), and the rest as shown.
 */
export async function queueJobs(supabase: ReturnType<typeof createAdminClient>, data: Row[]): Promise<QueueJob[]> {
  // a request for one camper (or a few) names them; a batch says what it covered (its note)
  const few = (data ?? []).filter((j) => j.item_count <= 3).map((j) => j.id);
  const { data: items } = few.length
    ? await supabase.from("print_job_items").select("job_id, copies, campers(first_name, last_name, camper_code, divisions(name), bunks(name))").in("job_id", few)
    : { data: [] as never[] };
  // how many labels each request prints (each camper's copies added up): its PDF, in parts when big
  const labelsOf = new Map<string, number>();
  const shownIds = (data ?? []).map((j) => j.id);
  if (shownIds.length) {
    const { inChunks } = await import("@/lib/supabase/in-chunks");
    const { fetchAll } = await import("@/lib/supabase/fetch-all");
    const copies = await inChunks(shownIds, (c) => fetchAll((from, to) => supabase.from("print_job_items").select("job_id, copies").in("job_id", c).order("job_id").order("camper_id").range(from, to))).catch(() => []);
    for (const r of copies) labelsOf.set(r.job_id, (labelsOf.get(r.job_id) ?? 0) + (r.copies ?? 1));
    // staff tag requests keep their people (and copies) on the request itself
    const staffIds = shownIds.filter((id) => !labelsOf.has(id));
    if (staffIds.length) {
      const { data: staffRows } = await supabase.from("print_jobs").select("id, staff_items").in("id", staffIds);
      for (const r of (staffRows ?? []) as unknown as { id: string; staff_items?: unknown }[])
        if (Array.isArray(r.staff_items)) labelsOf.set(r.id, (r.staff_items as { copies?: number }[]).reduce((n, i) => n + Math.max(1, Number(i?.copies) || 1), 0));
    }
  }
  const whoByJob = new Map<string, string[]>();
  // Unicode isolates: a Hebrew name or bunk keeps its own direction inside an English line
  const iso = (t: string) => `\u2068${t}\u2069`;
  for (const it of items ?? []) {
    const c = it.campers as { first_name: string; last_name: string; camper_code: string; divisions: { name: string } | null; bunks: { name: string } | null } | null;
    if (!c) continue;
    // names repeat across divisions, so say where and the code; copies when more than one
    const where = [c.divisions?.name, c.bunks?.name].filter(Boolean).join(" · ");
    whoByJob.set(it.job_id, [...(whoByJob.get(it.job_id) ?? []), `${iso(`${c.first_name} ${c.last_name}`)} (${where ? `${iso(where)} · ` : ""}${c.camper_code})${it.copies > 1 ? ` ×${it.copies}` : ""}`]);
  }
  return (data ?? []).map((j) => ({
    id: j.id,
    status: j.status,
    count: j.item_count,
    labels: labelsOf.get(j.id) ?? j.item_count,
    at: j.requested_at,
    to: j.deliver_to,
    error: shownJobError(j.error),
    pdf: Boolean(j.pdf_path),
    printedAt: j.printed_at,
    // the summary only (the lines under it, who's new and who's updated, are on the job's page)
    note: j.note ? j.note.split("\n")[0] : j.note,
    newCount: j.note ? Number(/^New \((\d+)\)/m.exec(j.note)?.[1] ?? 0) : 0,
    updatedCount: j.note ? Number(/^Updated \((\d+)\)/m.exec(j.note)?.[1] ?? 0) : 0,
    who: whoByJob.get(j.id)?.join(", ") ?? null,
    templateId: j.template_id,
    template: (j.print_templates as { name: string } | null)?.name ?? "Deleted template",
    by: (j.requester as { full_name: string } | null)?.full_name ?? "—",
    printedBy: (j.printer as { full_name: string } | null)?.full_name ?? null,
  }));
}
