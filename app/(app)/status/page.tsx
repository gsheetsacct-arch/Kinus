import Link from "next/link";
import { Activity } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBoard } from "@/components/status/status-board";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { LEVEL_RANK, effectiveLevel, isDirector, seesAllCamp, visibleFieldGroups } from "@/lib/auth/permissions";
import { loadAreaTree } from "@/lib/data/areas";
import { loadBoard } from "@/lib/data/board";
import { getCampContext } from "@/lib/data/camp";
import { defaultScope } from "@/lib/attendance/board";

export const metadata = { title: "Who's here" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function StatusPage() {
  const [user, session, camp] = await Promise.all([requireUser(), getActiveSession(), getCampContext()]);
  if (!session) return <EmptyState icon={Activity} title="No active session" description="Camp hasn't been set up yet." action={<Button asChild><Link href="/">Home</Link></Button>} />;
  const supabase = await createClient();
  const [{ data: fv }, tree, { data: templates }] = await Promise.all([
    supabase.from("field_visibility").select("field_group, roles"),
    loadAreaTree(supabase, session.id),
    supabase.from("print_templates").select("id, name").eq("show_on_card", true).order("sort_order").order("name"),
  ]);
  const rows = await loadBoard(supabase, session.id, visibleFieldGroups(user, fv ?? []).has("contacts"), camp.divisionIds);
  const inCamp = (id: string | null) => !camp.divisionIds || (id !== null && camp.divisionIds.includes(id));
  const campTree = { groups: tree.groups, divisions: tree.divisions.filter((d) => inCamp(d.id)) };
  const label = camp.camps.length > 1 ? (camp.current ? `All of ${camp.current.name}` : "All camps") : "Everyone";
  return (
    <div>
      <PageHeader title="Who's here" description="Where every camper is right now. Tap a name to check them in or out." />
      <StatusBoard
        rows={rows}
        tree={campTree}
        defaultScope={seesAllCamp(user) ? { kind: "all" } : defaultScope(user.coverage, campTree)}
        campLabel={label}
        serverNow={new Date().toISOString()}
        canBulk={isDirector(user)}
        canScan={LEVEL_RANK[effectiveLevel(user)] >= LEVEL_RANK.scan}
        templates={templates ?? []}
      />
    </div>
  );
}
