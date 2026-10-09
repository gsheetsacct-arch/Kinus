import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/callout";
import { Section } from "@/components/section";
import { JobActions, JobPreview } from "@/components/print/job-actions";
import { JOB_STATUS } from "@/lib/print/labels";
import { AutoRefresh } from "@/components/auto-refresh";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/current-user";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Print job" };
export const maxDuration = 60;

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const [, { id }, sp] = await Promise.all([requireUser(), params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("print_jobs")
    .select("id, status, item_count, requested_at, deliver_to, error, pdf_path, printed_at, note, print_templates(name), requester:requested_by(full_name), printer:printed_by(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();
  const items = await fetchAll((from, to) =>
    supabase.from("print_job_items").select("copies, campers(id, display_name, bunks(name))").eq("job_id", id).order("camper_id").range(from, to),
  );
  const st = JOB_STATUS[job.status] ?? { label: job.status, variant: "outline" as const };
  const template = (job.print_templates as { name: string } | null)?.name ?? "Deleted template";
  const requester = (job.requester as { full_name: string } | null)?.full_name ?? "someone";
  const printer = (job.printer as { full_name: string } | null)?.full_name;
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/print", label: "Print queue" }}
        title={`${job.item_count} × ${template}`}
        description={`Asked for by ${requester} · ${formatDateTime(job.requested_at)}${job.note ? ` · ${job.note}` : ""}`}
        actions={<Badge variant={st.variant}>{st.label}</Badge>}
      />
      {job.error && <Callout tone="warning">{job.error}</Callout>}
      {job.printed_at && (
        <Callout tone="success">
          Printed {formatDateTime(job.printed_at)}
          {printer ? ` by ${printer}` : ""}.
        </Callout>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {job.status === "queued" || job.status === "rendering" ? (
          <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            <AutoRefresh />
            Making the PDF… this page updates when it&apos;s done.
          </p>
        ) : (
          <JobPreview id={job.id} autoPrint={sp.print === "1"} />
        )}
        <div className="space-y-6">
          <Section title="Actions">
            <JobActions id={job.id} status={job.status} pdf={Boolean(job.pdf_path)} deliverTo={job.deliver_to} />
          </Section>
          <Section title={`Campers (${items.length})`} bodyClassName="p-0">
            <ul className="max-h-80 divide-y overflow-y-auto text-sm">
              {items.map((i) => {
                const c = i.campers as { id: string; display_name: string | null; bunks: { name: string } | null } | null;
                return (
                  <li key={c?.id} className="flex justify-between gap-2 px-4 py-2">
                    <span className="truncate" dir="auto">
                      {c?.display_name ?? "—"}
                      {i.copies > 1 && <span className="text-muted-foreground"> × {i.copies}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground" dir="auto">
                      {c?.bunks?.name ?? ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
