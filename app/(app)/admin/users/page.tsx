import Link from "next/link";
import { UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Callout } from "@/components/callout";
import { Button } from "@/components/ui/button";
import { StaffTable, type StaffRow } from "@/components/staff/staff-table";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireDirector } from "@/lib/auth/current-user";
import { canGrantAreas, canManageRole, isAdmin, type StaffRole } from "@/lib/auth/permissions";
import { ROLE_ORDER, areaLabel } from "@/lib/labels";
import { areaNames, grantableTree, loadAreaTree } from "@/lib/data/areas";
import { signInInfo, statusOf } from "@/lib/data/staff";
import { bulkSendLinks, bulkSetAccess, bulkSetActive } from "./actions";

export const metadata = { title: "Staff" };

export default async function UsersPage() {
  const me = await requireDirector();
  const session = await getActiveSession();
  const admin = createAdminClient();
  const [{ data: profiles }, { data: areas }, tree, info] = await Promise.all([
    admin.from("profiles").select("id, email, full_name, role, access_level, all_areas, is_active").order("full_name"),
    admin.from("staff_scopes").select("user_id, group_id, division_id, bunk_id"),
    loadAreaTree(admin, session?.id),
    signInInfo(),
  ]);
  const names = areaNames(tree);
  const groupOf = (id: string) => tree.divisions.find((d) => d.id === id)?.group_id ?? null;
  // a director of part of camp sees the people inside their part (and themselves)
  const inMyArea = (p: { id: string; role: StaffRole; all_areas: boolean }) => {
    if (isAdmin(me) || p.id === me.id) return true;
    const theirs = (areas ?? []).filter((a) => a.user_id === p.id).map(({ group_id, division_id, bunk_id }) => ({ group_id, division_id, bunk_id }));
    return p.role !== "owner" && !p.all_areas && theirs.length > 0 && canGrantAreas(me, theirs, false, groupOf);
  };
  const rows: StaffRow[] = (profiles ?? []).filter(inMyArea).map((p) => {
    const mine = (areas ?? []).filter((a) => a.user_id === p.id);
    const groupIds = mine.map((a) => a.group_id).filter((x): x is string => Boolean(x));
    const divisionIds = [
      ...new Set([...mine.map((a) => a.division_id).filter((x): x is string => Boolean(x)), ...tree.divisions.filter((d) => d.group_id && groupIds.includes(d.group_id)).map((d) => d.id)]),
    ];
    const everywhere = p.role === "owner" || p.all_areas;
    return {
      id: p.id,
      name: p.full_name,
      email: p.email,
      role: p.role,
      level: p.role === "owner" ? "edit" : p.access_level,
      allAreas: everywhere,
      where: everywhere ? "All of camp" : mine.length ? mine.map((a) => areaLabel(a, names)).join(", ") : "Nowhere yet",
      divisionIds,
      groupIds,
      status: statusOf(p.is_active, info.get(p.id)),
      active: p.is_active,
      lastSignIn: info.get(p.id)?.lastSignInAt ?? null,
      manageable: p.id !== me.id && canManageRole(me, p.role),
    };
  });
  const roles = ROLE_ORDER.filter((r) => canManageRole(me, r as StaffRole));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description={`${rows.filter((r) => r.active).length} active people`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/users/bulk">
                <Users /> Add many at once
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/users/new">
                <UserPlus /> Add a person
              </Link>
            </Button>
          </>
        }
      />
      {rows.length <= 1 && (
        <Callout title="Adding your team">
          Use <strong>Add many at once</strong> to paste your staff list from a spreadsheet (name, email, role, division, bunk). Everyone gets an invitation email. To change many people later, tick them below.
        </Callout>
      )}
      <StaffTable rows={rows} tree={grantableTree(me, tree)} roles={roles} actions={{ bulkSetAccess, bulkSendLinks, bulkSetActive }} lockAll={!isAdmin(me)} />
    </div>
  );
}
