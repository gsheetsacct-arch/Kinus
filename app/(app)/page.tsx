import Link from "next/link";
import { Users, ListChecks, Upload, ArrowRight, CalendarDays, Layers } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { STATUS_LABEL, type CamperStatus } from "@/lib/attendance/machine";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const session = await getActiveSession();
  const { denied } = await searchParams;
  const supabase = await createClient();

  const divisions = session
    ? ((await supabase.from("divisions").select("id, name, language, color, sort_order").eq("session_id", session.id).order("sort_order")).data ?? [])
    : [];
  const campers = session ? ((await supabase.from("campers_visible").select("id, division_id, status").eq("session_id", session.id).is("archived_at", null)).data ?? []) : [];
  const perDivision = divisions.map((d) => ({ ...d, count: campers.filter((c) => c.division_id === d.id).length })).filter((d) => d.count > 0 || isAdmin(user));
  const byStatus = (s: CamperStatus) => campers.filter((c) => c.status === s).length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const quick = [
    { href: "/campers", label: "Campers", desc: "Search and open any camper", icon: Users },
    { href: "/lists", label: "Lists", desc: "Bunk and division lists, print or CSV", icon: ListChecks },
    ...(isAdmin(user) ? [{ href: "/admin/imports/new", label: "Import export", desc: "Upload a new registration file", icon: Upload }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`${greeting}, ${user.fullName.split(" ")[0]}`} description={session ? session.name : "No active session yet"} />
      {denied && (
        <Alert variant="warning">
          <AlertTitle>Not allowed</AlertTitle>
          <AlertDescription>That page needs {denied} access.</AlertDescription>
        </Alert>
      )}
      {!session && isAdmin(user) && (
        <EmptyState
          icon={CalendarDays}
          title="Start by creating this year's session"
          description="Everything (divisions, campers, check-ins) lives inside a session. Create one and activate it, then upload the registration export."
          action={
            <Button asChild>
              <Link href="/admin/sessions">Create a session</Link>
            </Button>
          }
        />
      )}
      {session && campers.length === 0 && isAdmin(user) && (
        <EmptyState
          icon={Upload}
          title="No campers yet"
          description="Upload the registration export. You'll see exactly what will be added before anything is saved."
          action={
            <Button asChild>
              <Link href="/admin/imports/new">Import the export</Link>
            </Button>
          }
        />
      )}
      {session && campers.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="text-xs font-medium text-muted-foreground">Campers</div>
            <div className="mt-1 text-3xl font-semibold">{campers.length}</div>
          </div>
          {(["present", "expected", "out", "departed", "no_show"] as CamperStatus[]).map((s) => (
            <div key={s} className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="text-xs font-medium text-muted-foreground">{STATUS_LABEL[s]}</div>
              <div className="mt-1 text-3xl font-semibold">{byStatus(s)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {quick.map((q) => (
          <Link key={q.href} href={q.href} className="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:border-primary/40 hover:bg-primary-soft/40">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <q.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{q.label}</span>
              <span className="block truncate text-sm text-muted-foreground">{q.desc}</span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
      {perDivision.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <Layers className="size-4 text-muted-foreground" /> Divisions
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {perDivision.map((d) => (
              <Link key={d.id} href={`/campers?division=${d.id}`} className="flex items-center justify-between rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] hover:border-primary/40">
                <span className="flex items-center gap-3">
                  <span className="h-10 w-1.5 rounded-full" style={{ background: d.color ?? "var(--primary)" }} />
                  <span>
                    <span className="block font-medium" dir="auto">
                      {d.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">{d.count} campers</span>
                  </span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
