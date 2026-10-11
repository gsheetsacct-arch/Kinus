import Link from "next/link";
import { Printer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PrintQueue, type QueueJob } from "@/components/print/print-queue";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { officeEmail } from "@/lib/print/jobs";
import { cn } from "@/lib/utils";

export const metadata = { title: "Print queue" };
export const dynamic = "force-dynamic";

const SHOW = {
  todo: { label: "To print", statuses: ["queued", "rendering", "ready", "sent"] },
  problems: { label: "Problems", statuses: ["failed"] },
  printed: { label: "Printed", statuses: ["printed"] },
  all: { label: "Everything", statuses: null },
} as const;

export default async function PrintQueuePage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const [, session, sp] = await Promise.all([requireUser(), getActiveSession(), searchParams]);
  if (!session) return <EmptyState icon={Printer} title="No active session" description="Camp hasn't been set up yet." />;
  const show = (sp.show && sp.show in SHOW ? sp.show : "todo") as keyof typeof SHOW;
  const supabase = await createClient();
  let q = supabase
    .from("print_jobs")
    .select("id, status, item_count, requested_at, deliver_to, error, pdf_path, printed_at, note, print_templates(name), requester:requested_by(full_name), printer:printed_by(full_name)")
    .eq("session_id", session.id)
    .order("requested_at", { ascending: false })
    .limit(150);
  const statuses = SHOW[show].statuses;
  if (statuses) q = q.in("status", [...statuses]);
  const [{ data }, office, { count: problems }] = await Promise.all([
    q,
    officeEmail(),
    supabase.from("print_jobs").select("id", { count: "exact", head: true }).eq("session_id", session.id).eq("status", "failed"),
  ]);
  // a request for one camper (or a few) names them; a batch says what it covered (its note)
  const few = (data ?? []).filter((j) => j.item_count <= 3).map((j) => j.id);
  const { data: items } = few.length
    ? await supabase.from("print_job_items").select("job_id, copies, campers(first_name, last_name, camper_code, divisions(name), bunks(name))").in("job_id", few)
    : { data: [] as never[] };
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
  const jobs: QueueJob[] = (data ?? []).map((j) => ({
    id: j.id,
    status: j.status,
    count: j.item_count,
    at: j.requested_at,
    to: j.deliver_to,
    error: j.error,
    pdf: Boolean(j.pdf_path),
    printedAt: j.printed_at,
    note: j.note,
    who: whoByJob.get(j.id)?.join(", ") ?? null,
    template: (j.print_templates as { name: string } | null)?.name ?? "Deleted template",
    by: (j.requester as { full_name: string } | null)?.full_name ?? "—",
    printedBy: (j.printer as { full_name: string } | null)?.full_name ?? null,
  }));
  return (
    <div>
      <PageHeader
        title="Print queue"
        description={office.to ? `Tag requests are emailed to ${office.to} as a PDF, and wait here until marked printed.` : "No office email is set, so requests wait here. Set one in Settings."}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(SHOW) as (keyof typeof SHOW)[]).map((k) => (
          <Link
            key={k}
            href={k === "todo" ? "/print" : `/print?show=${k}`}
            className={cn("rounded-full border px-3 py-1 text-sm", show === k ? "border-primary bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}
          >
            {SHOW[k].label}
            {k === "problems" && problems ? <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-xs text-white">{problems}</span> : null}
          </Link>
        ))}
      </div>
      <PrintQueue jobs={jobs} show={show} />
    </div>
  );
}
