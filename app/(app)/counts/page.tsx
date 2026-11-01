import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Callout } from "@/components/callout";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { loadAreaTree } from "@/lib/data/areas";
import { canCount, canStartCount, countDivisionIds, seesCount } from "@/lib/data/head-counts";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatWhen } from "@/lib/utils";
import { createCount } from "./actions";

export const metadata = { title: "Head counts" };
export const dynamic = "force-dynamic";

/** Head counts (bus rides, trips): the open ones to count in, recent ones, and starting a new one. */
export default async function CountsPage() {
  const me = await requireUser();
  if (!canCount(me)) redirect("/?denied=scan");
  const session = await getActiveSession();
  if (!session) return <p className="text-muted-foreground">No active session.</p>;
  const admin = createAdminClient();
  const [tree, { data: all, error }] = await Promise.all([
    loadAreaTree(admin, session.id),
    admin.from("head_counts").select("id, name, division_ids, groups, created_by_name, created_at, closed_at").eq("session_id", session.id).order("created_at", { ascending: false }).limit(60),
  ]);
  const counts = (all ?? []).filter((c) => seesCount(me, c.division_ids));
  const open = counts.filter((c) => !c.closed_at);
  const closed = counts.filter((c) => c.closed_at).slice(0, 15);
  const divName = new Map(tree.divisions.map((d) => [d.id, d.name]));
  const allowed = countDivisionIds(me);
  const mine = tree.divisions.filter((d) => !allowed || allowed.includes(d.id));
  const row = (c: (typeof counts)[number]) => (
    <li key={c.id}>
      <Link href={`/counts/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium" dir="auto">
            {c.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground" dir="auto">
            {c.division_ids.map((d) => divName.get(d)).filter(Boolean).join(", ")}
            {c.groups.length > 0 && ` · ${c.groups.length} buses`} · {c.created_by_name}, {formatWhen(c.created_at)}
          </span>
        </span>
        {!c.closed_at && <Badge variant="success">Open</Badge>}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Head counts" description="Count who's with you (a bus, a trip) by scanning tags. It doesn't change anyone's check-in." />
      {error && <Callout tone="warning" title="Head counts need a database update">Apply migration 0048, then reload.</Callout>}
      <Section title="Open counts" bodyClassName="p-0">
        {open.length ? <ul className="divide-y">{open.map(row)}</ul> : <p className="px-5 py-6 text-sm text-muted-foreground">No open counts{canStartCount(me) ? ". Start one below." : ". Head staff start them."}</p>}
      </Section>
      {canStartCount(me) && mine.length > 0 && (
        <Section title="Start a count">
          <ActionForm action={createCount} className="space-y-4">
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" required maxLength={120} placeholder="Trip to the zoo: going" dir="auto" />
            </Field>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Divisions</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {mine.map((d) => (
                  <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm has-[:checked]:border-primary/50 has-[:checked]:bg-primary-soft/40">
                    <input type="checkbox" name="divisionIds" value={d.id} defaultChecked={mine.length === 1} className="size-4 accent-[var(--primary)]" />
                    {d.color && <span className="size-3 shrink-0 rounded-full" style={{ background: d.color }} />}
                    <span dir="auto">{d.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Everyone checked in in these divisions is expected.</p>
            </fieldset>
            <Field label="Buses (optional)" htmlFor="groups" hint="For one bus, leave it empty. For more: how many (3), or their names, one per line.">
              <Textarea id="groups" name="groups" rows={2} placeholder="3" className="max-w-sm" dir="auto" />
            </Field>
            <Button type="submit">Start the count</Button>
          </ActionForm>
        </Section>
      )}
      {closed.length > 0 && (
        <Section title="Closed" bodyClassName="p-0">
          <ul className="divide-y">{closed.map(row)}</ul>
        </Section>
      )}
    </div>
  );
}
