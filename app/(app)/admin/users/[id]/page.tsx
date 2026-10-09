import { notFound } from "next/navigation";
import { KeyRound, Mail, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Callout } from "@/components/callout";
import { ActionForm } from "@/components/action-form";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { RadioCards } from "@/components/ui/radio-cards";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireDirector } from "@/lib/auth/current-user";
import { isAdmin, type AccessLevel, type GlobalRole, type ScopeRole } from "@/lib/auth/permissions";
import { ACCESS_LEVELS, GLOBAL_ROLES, SCOPE_ROLES } from "@/lib/labels";
import { signInInfo, statusOf } from "@/lib/data/staff";
import { formatDateTime } from "@/lib/utils";
import { addScope, removeScope, sendSignInLink, setActive, setUserPassword, updateProfile, updateRole } from "../actions";
import { BunkPicker } from "./bunk-picker";

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireDirector();
  const { id } = await params;
  const session = await getActiveSession();
  const supabase = await createClient();
  const [{ data: p }, { data: scopes }, { data: divisions }, { data: bunks }, info] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, phone, global_role, is_active, created_at").eq("id", id).maybeSingle(),
    supabase.from("staff_scopes").select("id, division_id, bunk_id, scope_role, access_level").eq("user_id", id),
    session ? supabase.from("divisions").select("id, name").eq("session_id", session.id).order("sort_order") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase.from("bunks").select("id, division_id, name").order("sort_order"),
    signInInfo(),
  ]);
  if (!p) notFound();
  const admin = isAdmin(me);
  const isSelf = me.id === p.id;
  const canTouchOwner = p.global_role !== "owner" || me.role === "owner";
  const divName = (did: string) => divisions?.find((d) => d.id === did)?.name ?? "A division from another session";
  const bunkName = (bid: string | null) => (bid ? (bunks?.find((b) => b.id === bid)?.name ?? "?") : "All bunks");
  const signIn = info.get(p.id);
  const st = statusOf(p.is_active, signIn);
  const roles = (Object.keys(GLOBAL_ROLES) as GlobalRole[]).filter((r) => r !== "owner" || me.role === "owner" || p.global_role === "owner");

  return (
    <div className="space-y-6">
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

      <Section
        title="Divisions and bunks they can see"
        description={
          p.global_role === "staff"
            ? "As Staff, this is the only part of camp they can see."
            : `As ${GLOBAL_ROLES[p.global_role].label} they already see every camper. Adding a division here only decides which list layouts they get.`
        }
        actions={
          session ? (
            <FormDialog
              trigger={
                <Button size="sm">
                  <Plus /> Give access
                </Button>
              }
              title={`Give ${p.full_name.split(" ")[0]} access`}
              action={addScope}
              submitLabel="Give access"
              wide
            >
              <input type="hidden" name="user_id" value={p.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <BunkPicker divisions={divisions ?? []} bunks={bunks ?? []} />
              </div>
              <Field label="What are they there?">
                <RadioCards
                  name="scope_role"
                  defaultValue="counselor"
                  columns={2}
                  options={(Object.keys(SCOPE_ROLES) as ScopeRole[]).map((r) => ({ value: r, label: SCOPE_ROLES[r].label, description: SCOPE_ROLES[r].description }))}
                />
              </Field>
              <Field label="What may they do?">
                <RadioCards
                  name="access_level"
                  defaultValue="scan"
                  columns={3}
                  options={(Object.keys(ACCESS_LEVELS) as AccessLevel[]).map((l) => ({ value: l, label: ACCESS_LEVELS[l].label, description: ACCESS_LEVELS[l].description }))}
                />
              </Field>
            </FormDialog>
          ) : undefined
        }
        bodyClassName="p-0"
      >
        {scopes?.length ? (
          <ul className="divide-y">
            {scopes.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium" dir="auto">
                    {divName(s.division_id)} · {bunkName(s.bunk_id)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {SCOPE_ROLES[s.scope_role].label} · {ACCESS_LEVELS[s.access_level].label}
                  </span>
                </span>
                <ActionForm action={removeScope} confirm="Remove this access?">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="user_id" value={p.id} />
                  <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" type="submit">
                    <Trash2 /> Remove
                  </Button>
                </ActionForm>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-muted-foreground">{p.global_role === "staff" ? "None yet. Until you give access, they can't see any campers." : "None."}</p>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Role" description="What they can do across all of camp.">
          <ActionForm action={updateRole} className="space-y-4">
            <input type="hidden" name="id" value={p.id} />
            <RadioCards
              name="global_role"
              defaultValue={p.global_role}
              disabled={!admin || isSelf || !canTouchOwner}
              options={roles.map((r) => ({ value: r, label: GLOBAL_ROLES[r].label, description: GLOBAL_ROLES[r].description }))}
            />
            {admin && !isSelf && canTouchOwner && <Button type="submit">Save role</Button>}
            {isSelf && <p className="text-xs text-muted-foreground">You can&apos;t change your own role.</p>}
          </ActionForm>
        </Section>

        <div className="space-y-6">
          <Section title="Details">
            <ActionForm action={updateProfile} className="space-y-4">
              <input type="hidden" name="id" value={p.id} />
              <Field label="Full name" htmlFor="full_name">
                <Input id="full_name" name="full_name" defaultValue={p.full_name} disabled={!admin} dir="auto" />
              </Field>
              <Field label="Phone" htmlFor="phone">
                <Input id="phone" name="phone" type="tel" defaultValue={p.phone ?? ""} disabled={!admin} />
              </Field>
              {admin && <Button type="submit">Save details</Button>}
            </ActionForm>
          </Section>

          {admin && canTouchOwner && (
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
                  description="Useful when someone can't get email. Tell them the password privately; they can change it under Your account."
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
          )}

          {admin && !isSelf && canTouchOwner && (
            <Section tone="danger" title={p.is_active ? "Deactivate account" : "Account is deactivated"} description={p.is_active ? "They immediately lose access to everything. You can reactivate them later." : "They can't see anything until you reactivate them."}>
              <ActionForm action={setActive} confirm={p.is_active ? `Deactivate ${p.full_name}?` : undefined}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="active" value={p.is_active ? "false" : "true"} />
                <Button variant={p.is_active ? "destructive" : "default"} type="submit">
                  {p.is_active ? "Deactivate" : "Reactivate"}
                </Button>
              </ActionForm>
            </Section>
          )}
        </div>
      </div>
      {!session && <Callout tone="warning">Activate a session to give access to its divisions.</Callout>}
    </div>
  );
}
