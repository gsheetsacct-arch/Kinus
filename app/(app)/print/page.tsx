import { redirect } from "next/navigation";
import Link from "next/link";
import { Printer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PrintQueue, type QueueJob } from "@/components/print/print-queue";
import { LabelUpdates } from "@/components/print/label-updates";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { canUsePrintArea } from "@/lib/auth/permissions";
import { jobIdsInDivisions, myAreaJobIds, scopedQueue } from "@/lib/print/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { officeEmail, retryStuckJobs } from "@/lib/print/jobs";
import { shownJobError } from "@/lib/print/labels";
import { after } from "next/server";
import { appUrl } from "@/lib/auth/app-url";
import { cn } from "@/lib/utils";

export const metadata = { title: "Print queue" };
export const dynamic = "force-dynamic";
// resending and retrying requests make PDFs in the background of this page
export const maxDuration = 60;

const SHOW = {
  todo: { label: "To print", statuses: ["queued", "rendering", "ready", "sent"] },
  problems: { label: "Problems", statuses: ["failed"] },
  printed: { label: "Printed", statuses: ["printed"] },
  all: { label: "Everything", statuses: null },
} as const;

export default async function PrintQueuePage({ searchParams }: { searchParams: Promise<{ show?: string; camp?: string; division?: string }> }) {
  const [user, session, sp] = await Promise.all([requireUser(), getActiveSession(), searchParams]);
  // staff who only design templates start there
  if (!canUsePrintArea(user)) redirect("/print/templates");
  if (!session) return <EmptyState icon={Printer} title="No active session" description="Camp hasn't been set up yet." />;
  const show = (sp.show && sp.show in SHOW ? sp.show : "todo") as keyof typeof SHOW;
  // requests cut off while making their PDF get one more try (after the page is sent)
  const base = await appUrl();
  await retryStuckJobs(session.id, base, (fn) => after(fn)).catch((e) => console.error("Retrying stuck print jobs failed", e));
  // division heads: only their divisions' requests (and their own), read with the server's key
  const scoped = scopedQueue(user);
  const mine = scoped ? await myAreaJobIds(user, session.id) : null;
  const supabase = scoped ? createAdminClient() : await createClient();
  let q = supabase
    .from("print_jobs")
    .select("id, status, item_count, requested_at, deliver_to, error, pdf_path, printed_at, note, template_id, print_templates(name), requester:requested_by(full_name), printer:printed_by(full_name)")
    .eq("session_id", session.id)
    .order("requested_at", { ascending: false })
    .limit(mine ? 1000 : 150);
  const statuses = SHOW[show].statuses;
  if (statuses) q = q.in("status", [...statuses]);
  const [{ data: all }, office, { data: failed }] = await Promise.all([
    q,
    officeEmail(),
    supabase.from("print_jobs").select("id").eq("session_id", session.id).eq("status", "failed"),
  ]);
  // one camp's, or one division's (its check-in location), requests, when picked
  const admin = createAdminClient();
  const [{ data: divisionRows }, { data: groupRows }] = await Promise.all([
    admin.from("divisions").select("id, name, group_id").eq("session_id", session.id).order("sort_order"),
    admin.from("division_groups").select("id, name").eq("session_id", session.id).order("sort_order").order("name"),
  ]);
  const divisions = (divisionRows ?? []).filter((d) => !scoped || user.coverage.some((c) => c.division_id === d.id));
  const firstCamp = groupRows?.[0]?.id ?? null;
  const campOf = (d: { group_id: string | null }) => d.group_id ?? firstCamp;
  const camps = (groupRows ?? []).filter((g) => divisions.some((d) => campOf(d) === g.id));
  const division = divisions.find((d) => d.id === sp.division) ?? null;
  const camp = camps.find((g) => g.id === (division ? campOf(division) : sp.camp)) ?? null;
  const campDivisions = camp ? divisions.filter((d) => campOf(d) === camp.id) : divisions;
  const only = division ? [division.id] : camp && camps.length > 1 ? campDivisions.map((d) => d.id) : null;
  const inDivision = only ? await jobIdsInDivisions(session.id, only) : null;
  const queueHref = (o: { show?: string; camp?: string | null; division?: string | null }) =>
    `/print?${new URLSearchParams({ ...(o.show && o.show !== "todo" ? { show: o.show } : {}), ...(o.camp ? { camp: o.camp } : {}), ...(o.division ? { division: o.division } : {}) })}`;
  const data = (all ?? []).filter((j) => (!mine || mine.has(j.id)) && (!inDivision || inDivision.has(j.id))).slice(0, 150);
  const problems = (failed ?? []).filter((j) => !mine || mine.has(j.id)).length;
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
    error: shownJobError(j.error),
    pdf: Boolean(j.pdf_path),
    printedAt: j.printed_at,
    note: j.note,
    who: whoByJob.get(j.id)?.join(", ") ?? null,
    templateId: j.template_id,
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
      {/* camp, then division: one check-in location's labels */}
      {camps.length > 1 && (
        <Bar
          items={[{ href: queueHref({ show }), label: scoped ? "All mine" : "All camps", on: !camp }, ...camps.map((g) => ({ href: queueHref({ show, camp: g.id }), label: g.name, on: camp?.id === g.id }))]}
        />
      )}
      {campDivisions.length > 1 && (
        <Bar
          items={[
            { href: queueHref({ show, camp: camp?.id }), label: camp && camps.length > 1 ? `All of ${camp.name}` : scoped ? "All my divisions" : "All divisions", on: !division },
            ...campDivisions.map((d) => ({ href: queueHref({ show, camp: camp?.id, division: d.id }), label: d.name, on: division?.id === d.id })),
          ]}
        />
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(SHOW) as (keyof typeof SHOW)[]).map((k) => (
          <Link
            key={k}
            href={queueHref({ show: k, camp: camp?.id, division: division?.id })}
            className={cn("rounded-full border px-3 py-1 text-sm", show === k ? "border-primary bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}
          >
            {SHOW[k].label}
            {k === "problems" && problems ? <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-xs text-white">{problems}</span> : null}
          </Link>
        ))}
      </div>
      {show === "todo" && (
        <div className="mb-4">
          <LabelUpdates />
        </div>
      )}
      <PrintQueue jobs={jobs} show={show} />
    </div>
  );
}

/** A bar of choices, one on (like "Which campers" on Print a batch), as links. */
function Bar({ items }: { items: { href: string; label: string; on: boolean }[] }) {
  return (
    <nav className="mb-3 flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.on ? "page" : undefined}
          className={cn(
            "min-h-9 flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium whitespace-nowrap transition-colors",
            i.on ? "bg-background text-foreground shadow-sm ring-1 ring-primary" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
