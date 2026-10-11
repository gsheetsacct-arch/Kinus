import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CampersBrowser } from "@/components/campers/campers-browser";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { canAddWalkIn, isAdmin, visibleFieldGroups } from "@/lib/auth/permissions";
import { listCamperIndex } from "@/lib/data/campers";
import { loadAreaTree } from "@/lib/data/areas";
import { getCampContext } from "@/lib/data/camp";

export const metadata = { title: "Campers" };

export default async function CampersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const session = await getActiveSession();
  const sp = await searchParams;
  if (!session) return <p className="text-muted-foreground">No active session.</p>;
  const supabase = await createClient();
  const [camp, tree, { data: fv }] = await Promise.all([getCampContext(), loadAreaTree(supabase, session.id), supabase.from("field_visibility").select("field_group, roles")]);
  const archived = sp.archived === "1";
  const rows = await listCamperIndex(supabase, {
    sessionId: session.id,
    divisionIds: camp.divisionIds,
    includeArchived: archived,
    withPhones: visibleFieldGroups(user, fv ?? []).has("contacts"),
  });
  const divisions = tree.divisions.filter((d) => !camp.divisionIds || camp.divisionIds.includes(d.id));
  const rest = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "archived" && v) as [string, string][]);
  if (!archived) rest.set("archived", "1");

  return (
    <div>
      <PageHeader
        title="Campers"
        description={camp.current && camp.camps.length > 1 ? `${camp.current.name} camp` : undefined}
        actions={
          canAddWalkIn(user) ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/campers/new">Add walk-in</Link>
            </Button>
          ) : undefined
        }
      />
      <CampersBrowser
        key={camp.current?.id ?? "all"}
        rows={rows}
        divisions={divisions}
        initial={{ q: sp.q ?? "", division: divisions.some((d) => d.id === sp.division) ? sp.division : "", bunk: sp.bunk ?? "", status: sp.status ?? "", sort: sp.sort ?? "name" }}
        archivedHref={isAdmin(user) || archived ? `/campers${rest.size ? `?${rest}` : ""}` : null}
      />
    </div>
  );
}
