import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/current-user";
import { GLOBAL_ROLES, scopeSummary } from "@/lib/labels";
import { signOut } from "@/app/(auth)/actions";
import { changeMyPassword, updateMyProfile } from "./actions";

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const [{ data: profile }, { data: divisions }, { data: bunks }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, email").eq("id", me.id).single(),
    supabase.from("divisions").select("id, name"),
    supabase.from("bunks").select("id, name"),
  ]);
  const dName = (id: string) => divisions?.find((d) => d.id === id)?.name ?? "A division from another session";
  const bName = (id: string | null) => (id ? (bunks?.find((b) => b.id === id)?.name ?? "?") : null);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Your account" description={profile?.email} />
      <Section title="Your details" description="Your name is shown to other staff, for example next to check-ins you record.">
        <ActionForm action={updateMyProfile} className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="full_name">
            <Input id="full_name" name="full_name" defaultValue={profile?.full_name ?? ""} required dir="auto" />
          </Field>
          <Field label="Phone (optional)" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" defaultValue={profile?.phone ?? ""} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Save details</Button>
          </div>
        </ActionForm>
      </Section>
      <Section title="Password" description="Set or change the password you sign in with. You can always sign in with an emailed link instead.">
        <ActionForm action={changeMyPassword} className="grid gap-4 sm:grid-cols-2" resetOnSuccess>
          <Field label="New password" htmlFor="password" hint="At least 8 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Repeat new password" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Change password</Button>
          </div>
        </ActionForm>
      </Section>
      <Section title="What you can access">
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">{GLOBAL_ROLES[me.role].label}</Badge>
            <span className="text-muted-foreground">{GLOBAL_ROLES[me.role].description}</span>
          </div>
          {me.scopes.length > 0 && (
            <ul className="space-y-1.5">
              {me.scopes.map((s) => (
                <li key={s.id} className="rounded-lg border bg-background px-3 py-2" dir="auto">
                  {scopeSummary({ division_name: dName(s.division_id), bunk_name: bName(s.bunk_id), scope_role: s.scope_role, access_level: s.access_level })}
                </li>
              ))}
            </ul>
          )}
          {me.role === "staff" && me.scopes.length === 0 && <p className="text-muted-foreground">You haven&apos;t been given access to a division yet. Ask an admin.</p>}
        </div>
      </Section>
      <form action={signOut}>
        <Button variant="outline" type="submit">
          <LogOut /> Sign out
        </Button>
      </form>
    </div>
  );
}
