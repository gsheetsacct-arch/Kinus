import { notFound } from "next/navigation";
import { KeyRound, Mail } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Callout } from "@/components/callout";
import { ActionForm } from "@/components/action-form";
import { FormDialog } from "@/components/form-dialog";
import { PersonForm } from "@/components/staff/person-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireDirector } from "@/lib/auth/current-user";
import { canGrantAreas, canManageRole, isAdmin } from "@/lib/auth/permissions";
import { ROLE_ORDER, STAFF_ROLES } from "@/lib/labels";
import { encodeArea, loadAreaTree } from "@/lib/data/areas";
import { signInInfo, statusOf } from "@/lib/data/staff";
import { formatDateTime } from "@/lib/utils";
import { savePerson, sendSignInLink, setActive, setUserPassword } from "../actions";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireDirector();
  const { id } = await params;
  const session = await getActiveSession();
  const admin = createAdminClient();
  const [{ data: p }, { data: areas }, tree, info] = await Promise.all([
    admin.from("profiles").select("id, email, full_name, phone, role, access_level, all_areas, is_active").eq("id", id).maybeSingle(),
    admin.from("staff_scopes").select("group_id, division_id, bunk_id").eq("user_id", id),
    loadAreaTree(admin, session?.id),
    signInInfo(),
  ]);
  if (!p) notFound();
  const isSelf = me.id === p.id;
  // a director of part of camp only opens people inside their part
  const groupOf = (d: string) => tree.divisions.find((x) => x.id === d)?.group_id ?? null;
  if (!isAdmin(me) && !isSelf && (p.role === "owner" || p.all_areas || !(areas ?? []).length || !canGrantAreas(me, areas ?? [], false, groupOf))) notFound();
  const manageable = !isSelf && canManageRole(me, p.role);
  const signIn = info.get(p.id);
  const st = statusOf(p.is_active, signIn);
  const roles = ROLE_ORDER.filter((r) => canManageRole(me, r) || r === p.role);

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        back={{ href: "/admin/users", label: "Staff" }}
        title={p.full_name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {p.email}
            <Badge variant={st.variant}>{st.label}</Badge>
            {signIn?.lastSignInAt && <span>Last signed in {formatDateTime(signIn.lastSignInAt)}</span>}
          </span>
        }
      />
      {isSelf && <Callout>This is you. Ask another director to change your own role or area. Your name, phone and password are under Your account.</Callout>}
      {!isSelf && !manageable && <Callout tone="warning">As {STAFF_ROLES[me.role].label.toLowerCase()} you can see but not change a {STAFF_ROLES[p.role].label.toLowerCase()}.</Callout>}
      <Section title="Role and access">
        <PersonForm
          person={{ id: p.id, full_name: p.full_name, email: p.email, phone: p.phone ?? "", role: p.role, access_level: p.access_level, all_areas: p.all_areas, areas: (areas ?? []).map(encodeArea) }}
          roles={roles}
          tree={tree}
          action={savePerson}
          submitLabel="Save"
          lockAll={!isAdmin(me)}
          readOnly={!manageable}
        />
      </Section>
      {manageable && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Signing in" description="If they lost the invitation or forgot their password.">
            <div className="flex flex-wrap gap-2">
              <ActionForm action={sendSignInLink}>
                <input type="hidden" name="email" value={p.email} />
                <Button variant="outline" type="submit">
                  <Mail /> Email a sign-in link
                </Button>
              </ActionForm>
              <FormDialog
                trigger={
                  <Button variant="outline">
                    <KeyRound /> Set a password
                  </Button>
                }
                title={`Set a password for ${p.full_name.split(" ")[0]}`}
                description="Tell them the password privately; they can change it under Your account."
                action={setUserPassword}
                submitLabel="Set password"
              >
                <input type="hidden" name="id" value={p.id} />
                <Field label="New password" htmlFor="new-pw" hint="At least 8 characters.">
                  <Input id="new-pw" name="password" type="text" autoComplete="off" minLength={8} required />
                </Field>
              </FormDialog>
            </div>
          </Section>
          <Section tone="danger" title={p.is_active ? "Deactivate account" : "Account is deactivated"} description={p.is_active ? "They immediately lose access. You can reactivate them later." : "They can't see anything until reactivated."}>
            <ActionForm action={setActive} confirm={p.is_active ? `Deactivate ${p.full_name}?` : undefined}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="active" value={p.is_active ? "false" : "true"} />
              <Button variant={p.is_active ? "destructive" : "default"} type="submit">
                {p.is_active ? "Deactivate" : "Reactivate"}
              </Button>
            </ActionForm>
          </Section>
        </div>
      )}
    </div>
  );
}
