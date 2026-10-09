import Link from "next/link";
import { ChevronRight, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Callout } from "@/components/callout";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { RadioCards } from "@/components/ui/radio-cards";
import { createClient } from "@/lib/supabase/server";
import { requireDirector } from "@/lib/auth/current-user";
import { isAdmin, type GlobalRole } from "@/lib/auth/permissions";
import { GLOBAL_ROLES, scopeSummary } from "@/lib/labels";
import { signInInfo, statusOf } from "@/lib/data/staff";
import { initials } from "@/lib/utils";
import { inviteUser } from "./actions";

export const metadata = { title: "Staff" };

export default async function UsersPage() {
  const me = await requireDirector();
  const supabase = await createClient();
  const [{ data: profiles }, { data: scopes }, { data: divisions }, { data: bunks }, info] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, global_role, is_active").order("full_name"),
    supabase.from("staff_scopes").select("id, user_id, division_id, bunk_id, scope_role, access_level"),
    supabase.from("divisions").select("id, name"),
    supabase.from("bunks").select("id, name"),
    signInInfo(),
  ]);
  const divName = (id: string) => divisions?.find((d) => d.id === id)?.name ?? "?";
  const bunkName = (id: string | null) => (id ? (bunks?.find((b) => b.id === id)?.name ?? "?") : null);
  const roles = (Object.keys(GLOBAL_ROLES) as GlobalRole[]).filter((r) => r !== "owner" || me.role === "owner");

  const invite = isAdmin(me) ? (
    <FormDialog
      trigger={
        <Button>
          <UserPlus /> Invite someone
        </Button>
      }
      title="Invite a staff member"
      description="They get an email with a link to sign in and choose a password."
      action={inviteUser}
      submitLabel="Send invitation"
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="inv-name">
          <Input id="inv-name" name="full_name" required dir="auto" />
        </Field>
        <Field label="Email" htmlFor="inv-email">
          <Input id="inv-email" name="email" type="email" required />
        </Field>
      </div>
      <Field label="Role" hint="Counselors and head counselors are usually “Staff”. You choose their division or bunk on the next screen.">
        <RadioCards name="global_role" defaultValue="staff" columns={2} options={roles.map((r) => ({ value: r, label: GLOBAL_ROLES[r].label, description: GLOBAL_ROLES[r].description }))} />
      </Field>
    </FormDialog>
  ) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Staff" description={`${profiles?.length ?? 0} people can sign in.`} actions={invite} />
      <Callout title="How access works">
        A person&apos;s <strong>role</strong> decides what they can do everywhere. Directors, logistics and office see every camper. People with the role{" "}
        <strong>Staff</strong> only see the divisions or bunks you add on their page, for example a counselor and their bunk.
      </Callout>
      <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
        {(profiles ?? []).map((p) => {
          const mine = (scopes ?? []).filter((s) => s.user_id === p.id);
          const st = statusOf(p.is_active, info.get(p.id));
          return (
            <Link key={p.id} href={`/admin/users/${p.id}`} className="flex items-center gap-4 border-b px-4 py-3 last:border-0 hover:bg-muted/40 sm:px-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">{initials(p.full_name)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium" dir="auto">
                    {p.full_name}
                  </span>
                  <Badge variant="primary">{GLOBAL_ROLES[p.global_role].label}</Badge>
                  {st.label !== "Active" && <Badge variant={st.variant}>{st.label}</Badge>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
                {mine.length > 0 && (
                  <span className="mt-1 block truncate text-xs text-muted-foreground" dir="auto">
                    {mine.map((s) => scopeSummary({ division_name: divName(s.division_id), bunk_name: bunkName(s.bunk_id), scope_role: s.scope_role, access_level: s.access_level })).join("  •  ")}
                  </span>
                )}
                {p.global_role === "staff" && mine.length === 0 && p.is_active && <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">No division access yet — they can&apos;t see any campers.</span>}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
