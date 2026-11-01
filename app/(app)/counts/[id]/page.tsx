import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { HeadCountBoard } from "@/components/counts/head-count-board";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { loadAreaTree } from "@/lib/data/areas";
import { canCount, canStartCount, countCampers, countMarks, loadCount, seesCount } from "@/lib/data/head-counts";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatWhen } from "@/lib/utils";

export const metadata = { title: "Head count" };
export const dynamic = "force-dynamic";

/** One head count: scan kids onto your bus, and see who's counted (on every bus) and who's missing. */
export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  if (!canCount(me)) redirect("/?denied=scan");
  const { id } = await params;
  const count = await loadCount(id);
  if (!count || !seesCount(me, count.division_ids)) notFound();
  const session = await getActiveSession();
  if (!session) return <p className="text-muted-foreground">No active session.</p>;
  const [campers, marks, tree] = await Promise.all([countCampers(session.id, count.division_ids), countMarks(id), loadAreaTree(createAdminClient(), session.id)]);
  const divisions = tree.divisions.filter((d) => count.division_ids.includes(d.id)).map((d) => ({ id: d.id, name: d.name }));
  return (
    <div className="space-y-4">
      <PageHeader
        title={count.name}
        back={{ href: "/counts", label: "Head counts" }}
        description={`${divisions.map((d) => d.name).join(", ")} · started by ${count.created_by_name}, ${formatWhen(count.created_at)}${count.closed_at ? ` · closed ${formatWhen(count.closed_at)}${count.closed_by_name ? ` by ${count.closed_by_name}` : ""}` : ""}`}
      />
      <HeadCountBoard countId={id} groups={count.groups} campers={campers} initialMarks={marks} divisions={divisions} closed={Boolean(count.closed_at)} canClose={canStartCount(me)} />
    </div>
  );
}
