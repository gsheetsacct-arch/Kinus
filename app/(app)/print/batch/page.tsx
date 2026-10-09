import { PageHeader } from "@/components/page-header";
import { BatchForm } from "@/components/print/batch-form";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { loadAreaTree } from "@/lib/data/areas";
import { getCampContext } from "@/lib/data/camp";
import { officeEmail } from "@/lib/print/jobs";
import { visibleDivisionIds } from "@/lib/auth/permissions";

export const metadata = { title: "Print a batch" };
export const maxDuration = 60;

export default async function BatchPage() {
  const [user, session, camp] = await Promise.all([requireUser(), getActiveSession(), getCampContext()]);
  if (!session) return <p className="text-muted-foreground">No active session.</p>;
  const supabase = await createClient();
  const [tree, { data: templates }, office] = await Promise.all([
    loadAreaTree(supabase, session.id),
    supabase.from("print_templates").select("id, name").not("name", "like", "(retired)%").order("sort_order").order("name"),
    officeEmail(),
  ]);
  const allowed = visibleDivisionIds(user);
  const divisions = tree.divisions.filter((d) => (!camp.divisionIds || camp.divisionIds.includes(d.id)) && (!allowed || allowed.includes(d.id)));
  return (
    <div>
      <PageHeader title="Print a batch" description="Name tags or luggage tags for a whole camp, division or bunk, sorted by bunk." />
      <BatchForm
        templates={templates ?? []}
        divisions={divisions}
        campLabel={camp.camps.length > 1 ? (camp.current ? `All of ${camp.current.name}` : "All camps") : "Everyone"}
        officeTo={office.to}
      />
    </div>
  );
}
