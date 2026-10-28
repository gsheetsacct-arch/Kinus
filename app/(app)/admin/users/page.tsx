import Link from "next/link";
import { MessageSquare, ShieldCheck, UserPlus, Users } from "lucide-react";
import { carryAreasTo } from "@/lib/staff/carry-areas";
import { PageHeader } from "@/components/page-header";
import { Callout } from "@/components/callout";
import { Button } from "@/components/ui/button";
import { StaffTable, type StaffRow } from "@/components/staff/staff-table";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireStaffManager } from "@/lib/auth/current-user";
import { canGiveFinalCheckout, canGrantAreas, canManageRole, isAdmin, type StaffRole, isDirector } from "@/lib/auth/permissions";
import { ROLE_ORDER, areaLabel, STAFF_ROLES } from "@/lib/labels";
import { loadRoles, rolesInUse } from "@/lib/data/roles";
import { areaNames, grantableTree, loadAreaTree } from "@/lib/data/areas";
import { signInInfo, statusOf } from "@/lib/data/staff";
import { CheckinLogins } from "@/components/staff/checkin-logins";
import { checkinNameOf, shownEmail } from "@/lib/staff/login-kinds";
import { bulkSendLinks, bulkSetAccess, bulkSetActive, deletePeople } from "./actions";

export const metadata = { title: "Staff" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const me = await requireStaffManager();
  const { role: roleFilter } = await searchParams;
  const session = await getActiveSession();
  // anyone whose areas are all in an earlier session gets the same places in this one
  if (session) await carryAreasTo(session.id);
  const admin = createAdminClient();
  const [{ data: profiles }, { data: areas }, tree, info, setup] = await Promise.all([
    admin.from("profiles").select("id, email, full_name, title, role, access_level, all_areas, is_active, login").order("full_name"),
    admin.from("staff_scopes").select("user_id, group_id, division_id, bunk_id"),
    loadAreaTree(admin, session?.id),
    signInInfo(),
    loadRoles(admin),
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
      email: shownEmail(p.email) ?? "",
      title: p.title,
      role: p.role,
      level: p.role === "owner" ? "edit" : p.access_level,
      allAreas: everywhere,
      where: everywhere ? "All of camp" : mine.length ? mine.map((a) => areaLabel(a, names)).join(", ") : "Nowhere yet",
      divisionIds,
      groupIds,
      status: statusOf(p.is_active, info.get(p.id), p.login),
      active: p.is_active,
      lastSignIn: info.get(p.id)?.lastSignInAt ?? null,
      manageable: p.id !== me.id && canManageRole(me, p.role),
    };
  });
  const roles = rolesInUse(setup, ROLE_ORDER).filter((r) => canManageRole(me, r as StaffRole));
  // the check-in logins of each division this person looks after (any number per division)
  const grantable = grantableTree(me, tree);
  const shared = (profiles ?? []).filter((p) => p.login === "shared");
  // final check-out (read on its own: a database without migration 0029 still shows the page)
  const { data: finals } = shared.length ? await admin.from("profiles").select("id, final_checkout").in("id", shared.map((p) => p.id)) : { data: [] };
  const finalOn = new Set((finals ?? []).filter((f) => f.final_checkout).map((f) => f.id));
  const checkinLogins = grantable.divisions.map((d) => ({
    divisionId: d.id,
    divisionName: d.name,
    color: d.color,
    // head staff give their own division's logins final check-out; directors any in their area
    campName: tree.groups?.find((g) => g.id === d.group_id)?.name ?? null,
    canGiveFinal: canGiveFinalCheckout(me),
    accounts: shared
      .filter((p) => (areas ?? []).some((a) => a.user_id === p.id && a.division_id === d.id))
      .map((p) => ({ id: p.id, name: checkinNameOf(p.email) ?? p.email, active: p.is_active, lastSignIn: info.get(p.id)?.lastSignInAt ?? null, finalCheckout: finalOn.has(p.id) }))
      .sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true })),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description={isDirector(me) ? `${rows.filter((r) => r.active).length} active people` : `Your divisions' staff · ${rows.filter((r) => r.active).length} active. You can add and change ${roles.map((r) => STAFF_ROLES[r].label.toLowerCase() + "s").join(" and ")}.`}
        actions={
          <>
            {isDirector(me) && (
              <Button asChild variant="ghost">
                <Link href="/admin/users/updates">
                  <MessageSquare /> Updates sign-ups
                </Link>
              </Button>
            )}
            {isAdmin(me) && (
              <Button asChild variant="ghost">
                <Link href="/admin/roles">
                  <ShieldCheck /> Roles
                </Link>
              </Button>
            )}
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
      {canManageRole(me, "scanner") && setup.inUse.scanner && <CheckinLogins logins={checkinLogins} />}
      <StaffTable rows={rows} tree={grantableTree(me, tree)} roles={roles} actions={{ bulkSetAccess, bulkSendLinks, bulkSetActive, deletePeople }} lockAll={!isAdmin(me)} initialRole={roleFilter && roleFilter in STAFF_ROLES ? roleFilter : undefined} />
    </div>
  );
}
