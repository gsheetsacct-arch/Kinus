import { redirect } from "next/navigation";
import { canFollowUp } from "@/lib/auth/permissions";
import Link from "next/link";
import { UserSearch } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MissingBoard } from "@/components/status/missing-board";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { LEVEL_RANK, effectiveLevel, isAdmin, seesAllCamp, visibleFieldGroups } from "@/lib/auth/permissions";
import { loadAreaTree } from "@/lib/data/areas";
import { loadBoard } from "@/lib/data/board";
import { getCampContext } from "@/lib/data/camp";
import { campStarted, loadFollowups, loadRules } from "@/lib/data/missing";
import { defaultScope } from "@/lib/attendance/board";

export const metadata = { title: "Not here yet" };
export const dynamic = "force-dynamic";

export default async function MissingPage() {
  const [user, session, camp] = await Promise.all([requireUser(), getActiveSession(), getCampContext()]);
  // counselors see their bunk on Who's here; following up is for the people over them
  if (!canFollowUp(user)) redirect("/status");
  if (!session) return <EmptyState icon={UserSearch} title="No active session" description="Camp hasn't been set up yet." action={<Button asChild><Link href="/">Home</Link></Button>} />;
  const supabase = await createClient();
  const [{ data: fv }, tree, { data: templates }, rules, followups] = await Promise.all([
    supabase.from("field_visibility").select("field_group, roles"),
    loadAreaTree(supabase, session.id),
    supabase.from("print_templates").select("id, name").eq("show_on_card", true).order("sort_order").order("name"),
    loadRules(supabase),
    loadFollowups(supabase, session.id),
  ]);
  const started = await campStarted(session.id);
  const rows = await loadBoard(supabase, session.id, visibleFieldGroups(user, fv ?? []).has("contacts"), camp.divisionIds);
  const campTree = { groups: tree.groups, divisions: tree.divisions.filter((d) => !camp.divisionIds || camp.divisionIds.includes(d.id)) };
  const rule = [rules.percent ? `${rules.percent}% of their bunk is here` : null, rules.after_time ? `it's past ${rules.after_time}` : null].filter(Boolean).join(" or ");
  return (
    <div>
      <PageHeader
        title="Not here yet"
        description={
          <>
            Campers who haven&apos;t arrived. They&apos;re flagged “check up on” once {rule || "… (no rule is set)"}.{" "}
            {isAdmin(user) && (
              <Link href="/admin/settings" className="text-primary hover:underline">
                Change
              </Link>
            )}
          </>
        }
      />
      <MissingBoard
        rows={rows}
        followups={followups}
        rules={rules}
        campStarted={started}
        tree={campTree}
        defaultScope={seesAllCamp(user) ? { kind: "all" } : defaultScope(user.coverage, campTree)}
        campLabel={camp.camps.length > 1 ? (camp.current ? `All of ${camp.current.name}` : "All camps") : "Everyone"}
        canAct={LEVEL_RANK[effectiveLevel(user)] >= LEVEL_RANK.scan}
        templates={templates ?? []}
        serverNow={new Date().toISOString()}
      />
    </div>
  );
}
