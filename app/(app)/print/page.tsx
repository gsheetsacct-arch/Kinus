import { redirect } from "next/navigation";
import Link from "next/link";
import { Printer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PrintQueue } from "@/components/print/print-queue";
import { LabelUpdates } from "@/components/print/label-updates";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { canUsePrintArea } from "@/lib/auth/permissions";
import { queueScope, waitingSets } from "@/lib/print/queue";
import { WaitingAll } from "@/components/print/waiting-all";
import { createAdminClient } from "@/lib/supabase/admin";
import { officeEmail, retryStuckJobs } from "@/lib/print/jobs";
import { after } from "next/server";
import { appUrl } from "@/lib/auth/app-url";
import { cn } from "@/lib/utils";
import { QUEUE_JOB_FIELDS, queueJobs } from "@/lib/print/queue-jobs";
import { checkinOnly } from "@/lib/print/access";
import { checkinWaitingSets } from "@/lib/print/waiting-ids";
import type { CurrentUser } from "@/lib/auth/permissions";

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
  if (!session) return <EmptyState icon={Printer} title="No active session" description="Camp hasn't been set up yet." />;
  // a division's check-in login: only its divisions' label-printer labels
  if (checkinOnly(user)) return <CheckinLabels user={user} sessionId={session.id} />;
  // staff who only design templates start there
  if (!canUsePrintArea(user)) redirect("/print/templates");
  const show = (sp.show && sp.show in SHOW ? sp.show : "todo") as keyof typeof SHOW;
  // requests cut off while making their PDF get one more try (after the page is sent)
  const base = await appUrl();
  await retryStuckJobs(session.id, base, (fn) => after(fn)).catch((e) => console.error("Retrying stuck print jobs failed", e));
  // someone over part of camp: only their divisions' requests (and their own), read with the server's key
  const scope = await queueScope(user, session.id, { camp: sp.camp, division: sp.division });
  const { scoped, mine, camps, camp, division, campDivisions } = scope;
  const supabase = scoped ? createAdminClient() : await createClient();
  let q = supabase
    .from("print_jobs")
    .select(QUEUE_JOB_FIELDS)
    .eq("session_id", session.id)
    .order("requested_at", { ascending: false })
    .limit(mine || scope.division || scope.camp ? 1000 : 150);
  const statuses = SHOW[show].statuses;
  if (statuses) q = q.in("status", [...statuses]);
  const [{ data: all }, office, { data: failed }, sets] = await Promise.all([
    q,
    officeEmail(),
    supabase.from("print_jobs").select("id").eq("session_id", session.id).eq("status", "failed"),
    show === "todo" ? waitingSets(session.id, scope.shows) : Promise.resolve([]),
  ]);
  const queueHref = (o: { show?: string; camp?: string | null; division?: string | null }) =>
    `/print?${new URLSearchParams({ ...(o.show && o.show !== "todo" ? { show: o.show } : {}), ...(o.camp ? { camp: o.camp } : {}), ...(o.division ? { division: o.division } : {}) })}`;
  const data = (all ?? []).filter((j) => scope.shows(j.id)).slice(0, 150);
  const problems = (failed ?? []).filter((j) => !mine || mine.has(j.id)).length;
  const jobs = await queueJobs(supabase, data);
  return (
    <div>
      <PageHeader
        title="Print queue"
        description={office.to ? `Tag requests are emailed to ${office.to} as a PDF, and wait here until marked printed.` : "No office email is set, so requests wait here. Set one in Settings."}
      />
      {/* first thing on the page: everything waiting, printed in one go (each camper's labels together) */}
      {sets.map((set) => (
        <WaitingAll key={set.key} set={set} where={division?.name ?? camp?.name ?? null} query={new URLSearchParams({ waiting: set.key, order: "name", ...(camp ? { camp: camp.id } : {}), ...(division ? { division: division.id } : {}) }).toString()} />
      ))}
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
      <PrintQueue jobs={jobs} show={show} together={sets.flatMap((s) => s.templateIds)} />
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

/**
 * A check-in login's print page: every label-printer (thermal) label queued for its divisions,
 * all in one go. Nothing else from the queue.
 */
async function CheckinLabels({ user, sessionId }: { user: CurrentUser; sessionId: string }) {
  const { shows } = await queueScope(user, sessionId, {});
  const admin = createAdminClient();
  const [sets, { data: rows }] = await Promise.all([
    checkinWaitingSets(sessionId, shows),
    // each request on its own too: its divisions' label-printer labels still to print
    admin
      .from("print_jobs")
      .select("id, status, item_count, requested_at, deliver_to, error, pdf_path, printed_at, note, template_id, print_templates!inner(name, thermal), requester:requested_by(full_name), printer:printed_by(full_name)")
      .eq("session_id", sessionId).eq("print_templates.thermal", true).in("status", ["queued", "rendering", "ready", "sent"]).order("requested_at", { ascending: false }).limit(1000),
  ]);
  const jobs = await queueJobs(admin, (rows ?? []).filter((j) => shows(j.id)).slice(0, 300) as never);
  return (
    <div>
      <PageHeader title="Labels to print" description="The label-printer labels waiting for your divisions: the name tags and bag labels for registration, however they were asked for." />
      {sets.map((set) => (
        <WaitingAll key={set.key} set={set} where={null} query={new URLSearchParams({ waiting: set.key, order: "name" }).toString()} />
      ))}
      {jobs.length ? (
        <PrintQueue jobs={jobs} show="todo" together={sets.flatMap((s) => s.templateIds)} checkin />
      ) : (
        <EmptyState icon={Printer} title="Nothing to print" description="Label-printer labels for your divisions show up here as they're asked for." />
      )}
    </div>
  );
}
