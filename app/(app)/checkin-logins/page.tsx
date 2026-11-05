import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CheckinLogins } from "@/components/staff/checkin-logins";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/current-user";
import { canAddCheckinLogins, checkinDivisionIds, isStaffManager } from "@/lib/auth/permissions";
import { signInInfo } from "@/lib/data/staff";
import { checkinNameOf } from "@/lib/staff/login-kinds";

export const metadata = { title: "Check-in logins" };
export const dynamic = "force-dynamic";

/** A check-in helper's page: the check-in logins of its divisions, and adding more (one per phone). */
export default async function CheckinLoginsPage() {
  const me = await requireUser();
  if (!canAddCheckinLogins(me)) redirect(isStaffManager(me) ? "/admin/users" : "/");
  const ids = checkinDivisionIds(me);
  const admin = createAdminClient();
  const [{ data: divisions }, { data: scopes }, info] = await Promise.all([
    ids.length ? admin.from("divisions").select("id, name, color, sort_order").in("id", ids).order("sort_order") : Promise.resolve({ data: [] as { id: string; name: string; color: string | null }[] }),
    ids.length ? admin.from("staff_scopes").select("user_id, division_id").in("division_id", ids) : Promise.resolve({ data: [] as { user_id: string; division_id: string | null }[] }),
    signInInfo(),
  ]);
  const userIds = [...new Set((scopes ?? []).map((s) => s.user_id))];
  const { data: shared } = userIds.length
    ? await admin.from("profiles").select("id, email, is_active, login").in("id", userIds).eq("login", "shared")
    : { data: [] as { id: string; email: string; is_active: boolean; login: string }[] };
  const logins = (divisions ?? []).map((d) => ({
    divisionId: d.id,
    divisionName: d.name,
    color: d.color,
    accounts: (shared ?? [])
      .filter((p) => (scopes ?? []).some((s) => s.user_id === p.id && s.division_id === d.id))
      .map((p) => ({ id: p.id, name: checkinNameOf(p.email) ?? p.email, active: p.is_active, lastSignIn: info.get(p.id)?.lastSignInAt ?? null }))
      .sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true })),
  }));
  return (
    <div className="space-y-4">
      <PageHeader title="Check-in logins" description="The logins for the phones at your check-in line." />
      {logins.length ? <CheckinLogins logins={logins} helper /> : <p className="text-sm text-muted-foreground">You don&apos;t check in a whole division, so you can&apos;t add check-in logins. Ask your division head.</p>}
    </div>
  );
}
