import Link from "next/link";
import { Users, ListChecks, Upload, ArrowRight, Layers, Check, Circle, ScanLine, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Callout } from "@/components/callout";
import { createClient } from "@/lib/supabase/server";
import { loadAreaTree } from "@/lib/data/areas";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { canFollowUp, isAdmin, seesAllCamp, type CurrentUser } from "@/lib/auth/permissions";
import { campStarted, flagRows, loadFollowups, loadRules } from "@/lib/data/missing";
import { STATUS_LABEL, type CamperStatus } from "@/lib/attendance/machine";
import { cn, formatTime } from "@/lib/utils";
import { AutoRefresh } from "@/components/auto-refresh";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { getCampContext } from "@/lib/data/camp";
import { campHour } from "@/lib/time";

export const metadata = { title: "Home" };

async function setupSteps(user: CurrentUser, sessionId: string | null) {
  const supabase = await createClient();
  const [imports, profiles, scopes, staffRole, office, divisions] = await Promise.all([
    sessionId ? supabase.from("imports").select("id", { count: "exact", head: true }).eq("session_id", sessionId).eq("status", "applied") : Promise.resolve({ count: 0 }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("staff_scopes").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id, all_areas, role").eq("is_active", true).eq("all_areas", false).neq("role", "owner"),
    supabase.from("settings").select("value").eq("key", "office_email").maybeSingle(),
    sessionId ? supabase.from("divisions").select("name").eq("session_id", sessionId) : Promise.resolve({ data: [] as { name: string }[] }),
  ]);
  const oddDivisions = (divisions.data ?? []).filter((d) => d.name.includes(",")).length;
  return [
    { done: Boolean(sessionId), title: "Create this year's session", description: "Everything you import lives in a session.", href: "/admin/sessions", cta: "Sessions" },
    { done: (imports.count ?? 0) > 0, title: "Import the roster", description: "Upload the registration export. You review every change before it's saved.", href: "/admin/imports", cta: "Import" },
    {
      done: (imports.count ?? 0) > 0 && oddDivisions === 0,
      title: "Check divisions and bunks",
      description: oddDivisions ? `${oddDivisions} divisions have combined names from an older import. Undo it and import again, or tidy them up.` : "Rename, reorder or merge anything that looks off.",
      href: "/admin/divisions",
      cta: "Divisions",
    },
    { done: (profiles.count ?? 0) > 1, title: "Invite your staff", description: "Head counselors, division heads, office and logistics.", href: "/admin/users", cta: "Staff" },
    {
      done: (profiles.count ?? 0) > 1 && ((staffRole.data ?? []).length === 0 || (scopes.count ?? 0) > 0),
      title: "Give counselors their bunks",
      description: "People who aren't over all of camp only see the groups, divisions or bunks you give them.",
      href: "/admin/users",
      cta: "Staff",
    },
    { done: Boolean((office.data?.value as { to?: string } | null)?.to), title: "Set the office email", description: "Where name tag requests will be sent.", href: "/admin/settings", cta: "Settings" },
  ].map((s) => ({ ...s, show: isAdmin(user) }));
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const [user, session, camp, { denied }] = await Promise.all([requireUser(), getActiveSession(), getCampContext(), searchParams]);
  const supabase = await createClient();
  const inCamp = (id: string | null) => !camp.divisionIds || (id !== null && camp.divisionIds.includes(id));
  const [divisionRows, allCampers, steps] = await Promise.all([
    loadAreaTree(supabase, session?.id).then((t) => t.divisions),
    session
      ? fetchAll((from, to) => supabase.from("campers").select("id, division_id, bunk_id, status").eq("session_id", session.id).is("archived_at", null).order("id").range(from, to))
      : Promise.resolve([]),
    isAdmin(user) ? setupSteps(user, session?.id ?? null) : Promise.resolve([]),
  ]);
  const divisions = divisionRows.filter((d) => inCamp(d.id));
  const campers = allCampers.filter((c) => inCamp(c.division_id));
  // campers who should be here by now (same rules as "Not here yet")
  let toCheck = 0;
  if (session && canFollowUp(user) && campers.some((c) => c.status === "expected")) {
    const [rules, followups, started] = await Promise.all([loadRules(supabase), loadFollowups(supabase, session.id), campStarted(session.id)]);
    const flags = flagRows(campers.map((c) => ({ id: c.id, divisionId: c.division_id, bunkId: c.bunk_id, status: c.status })), rules, followups, started);
    toCheck = Object.values(flags).filter((f) => f.kind === "check").length;
  }
  // a division card where they see the whole division, else a card per bunk they have
  const wholeDivision = (id: string) => seesAllCamp(user) || user.coverage.some((c) => c.division_id === id && c.bunk_id === null);
  const areas = divisions.flatMap((d) => {
    const count = (bunkId?: string) => campers.filter((c) => c.division_id === d.id && (!bunkId || c.bunk_id === bunkId)).length;
    if (wholeDivision(d.id)) return [{ key: d.id, name: d.name, sub: null as string | null, color: d.color, count: count(), where: `d:${d.id}` }];
    return d.bunks.map((b) => ({ key: b.id, name: b.name, sub: d.name, color: d.color, count: count(b.id), where: `b:${d.id}:${b.id}` }));
  }).filter((a) => a.count > 0);
  const areaLabel = areas.length === 1 ? areas[0].name : "Campers";
  const tile = "rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:border-primary/40 hover:bg-primary-soft/30";
  const remaining = steps.filter((s) => !s.done);
  const next = remaining[0];
  const hour = campHour();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const quick = [
    { href: "/scan", label: "Check in", desc: "Scan tags or search to check campers in and out", icon: ScanLine },
    { href: "/campers", label: "Find a camper", desc: "Search by name, code or parent's phone", icon: Users },
    { href: "/lists", label: "Print a list", desc: "Bunk and division lists, or CSV", icon: ListChecks },
    ...(isAdmin(user) ? [{ href: "/admin/imports/new", label: "Import the export", desc: "When registrations change", icon: Upload }] : []),
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${greeting}, ${user.fullName.split(" ")[0]}`}
        description={session ? [session.name, camp.camps.length > 1 ? (camp.current ? `${camp.current.name} camp` : "All camps") : null].filter(Boolean).join(" · ") : "No active session yet"}
      />
      {denied && <Callout tone="warning">That page needs {denied} access. Ask an admin if you think you should have it.</Callout>}
      {!session && !isAdmin(user) && <Callout>Camp hasn&apos;t been set up yet. An admin needs to create this year&apos;s session.</Callout>}
      {!user.allAreas && user.role !== "owner" && user.areas.length === 0 && <Callout tone="warning">You haven&apos;t been given a division or bunk yet. Ask a director to add you.</Callout>}

      {toCheck > 0 && (
        <Link
          href="/missing"
          className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-[var(--shadow-card)] hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <AlertTriangle className="size-5 shrink-0" />
          <span className="flex-1">
            <span className="block font-semibold">
              Check up on {toCheck} {toCheck === 1 ? "camper" : "campers"}
            </span>
            <span className="block text-sm opacity-80">Not here yet, though they should be by now.</span>
          </span>
          <ArrowRight className="size-4" />
        </Link>
      )}

      {steps.length > 0 && remaining.length > 0 && (
        <Section title="Getting started" description={`${steps.length - remaining.length} of ${steps.length} done`} bodyClassName="p-0">
          <ol className="divide-y">
            {steps.map((s, i) => (
              <li key={i} className={cn("flex items-center gap-4 px-5 py-4", s === next && "bg-primary-soft/40")}>
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border", s.done ? "border-status-present bg-status-present text-white" : "text-muted-foreground")}>
                  {s.done ? <Check className="size-4" /> : <Circle className="size-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block font-medium", s.done && "text-muted-foreground line-through decoration-muted-foreground/40")}>{s.title}</span>
                  {!s.done && <span className="block text-sm text-muted-foreground">{s.description}</span>}
                </span>
                {!s.done && (
                  <Link href={s.href} className={cn("shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium", s === next ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary-soft")}>
                    {s.cta}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {session && campers.length > 0 && (
        <section className="space-y-3">
          {/* the numbers reload by themselves every 30 s while the page is open */}
          <AutoRefresh every={30000} />
          <h2 className="flex items-baseline gap-2 text-base font-semibold">
            Right now <span className="text-xs font-normal text-muted-foreground">as of {formatTime(new Date().toISOString())}</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Link href="/status?status=all" className={tile}>
              <div className="text-xs font-medium text-muted-foreground">{areaLabel}</div>
              <div className="mt-1 text-3xl font-semibold">{campers.length}</div>
            </Link>
            {(["present", "expected", "out", "departed", "no_show"] as CamperStatus[]).map((s) => (
              <Link key={s} href={`/status?status=${s}`} className={tile}>
                <div className="text-xs font-medium text-muted-foreground">{STATUS_LABEL[s]}</div>
                <div className="mt-1 text-3xl font-semibold">{campers.filter((c) => c.status === s).length}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Shortcuts</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quick.map((q) => (
            <Link key={q.href} href={q.href} className="group flex min-w-0 items-center gap-4 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:border-primary/40 hover:bg-primary-soft/40">
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
      </section>

      {areas.length > 1 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Layers className="size-4 text-muted-foreground" /> {areas.some((a) => a.sub) ? "Your bunks" : "Divisions"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((d) => (
              <Link key={d.key} href={`/status?status=all&where=${d.where}`} className="flex min-w-0 items-center justify-between rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] hover:border-primary/40">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: d.color ?? "var(--primary)" }} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium" dir="auto">
                      {d.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {d.sub ? `${d.sub} · ` : ""}
                      {d.count} {d.count === 1 ? "camper" : "campers"}
                    </span>
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
