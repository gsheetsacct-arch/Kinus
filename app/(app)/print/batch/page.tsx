import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { BatchForm } from "@/components/print/batch-form";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { loadAreaTree } from "@/lib/data/areas";
import { getCampContext } from "@/lib/data/camp";
import { officeEmail } from "@/lib/print/jobs";
import { canUsePrintArea, isAdmin, visibleDivisionIds } from "@/lib/auth/permissions";
import { BuzzerBox } from "@/components/print/buzzer-box";
import { buzzerCounts } from "@/lib/buzzers";
import { forCamp, templateCamps } from "@/lib/print/template-camps";

export const metadata = { title: "Print a batch" };
export const maxDuration = 60;

export default async function BatchPage() {
  const [user, session, camp] = await Promise.all([requireUser(), getActiveSession(), getCampContext()]);
  if (!canUsePrintArea(user)) redirect("/print/templates");
  if (!session) return <p className="text-muted-foreground">No active session.</p>;
  const supabase = await createClient();
  const [tree, { data: templates }, office, buzzers] = await Promise.all([
    loadAreaTree(supabase, session.id),
    // whole rows: works before migration 0028 (copies), when every tag is one each
    supabase.from("print_templates").select("*").not("name", "like", "(retired)%").order("sort_order").order("name"),
    officeEmail(),
    isAdmin(user) ? buzzerCounts(session.id) : Promise.resolve(null),
  ]);
  const allowed = visibleDivisionIds(user);
  const divisions = tree.divisions.filter((d) => (!camp.divisionIds || camp.divisionIds.includes(d.id)) && (!allowed || allowed.includes(d.id)));
  return (
    <div>
      <PageHeader title="Print a batch" description="Name tags or luggage tags for a whole camp, division or bunk, sorted by bunk." />
      {buzzers && <BuzzerBox have={buzzers.with} without={buzzers.without} highest={buzzers.highest} />}
      <BatchForm
        templates={(templates ?? [])
          // the current camp's templates (all of them when looking at every camp, with whose they are)
          .filter((t) => forCamp(t, camp.current?.name))
          .map((t) => ({ id: t.id, name: !camp.current && templateCamps(t).length ? `${t.name} (${templateCamps(t).join(", ")})` : t.name, copies: Number((t as { copies?: number }).copies) || 1 }))}
        divisions={divisions}
        campLabel={camp.camps.length > 1 ? (camp.current ? `All of ${camp.current.name}` : "All camps") : "Everyone"}
        officeTo={office.to}
      />
    </div>
  );
}
