import Link from "next/link";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/current-user";
import { ACCESS_LEVELS, FIELD_GROUPS, ROLE_EXTRAS, ROLE_ORDER, STAFF_ROLES } from "@/lib/labels";
import { loadRoles } from "@/lib/data/roles";
import type { AccessLevel } from "@/lib/auth/permissions";
import { plural } from "@/lib/utils";
import { saveRoles } from "./actions";

export const metadata = { title: "Roles" };

export default async function RolesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [setup, { data: people }] = await Promise.all([loadRoles(supabase), createAdminClient().from("profiles").select("role").eq("is_active", true)]);
  const count = (r: string) => (people ?? []).filter((p) => p.role === r).length;
  const roles = ROLE_ORDER.filter((r) => r !== "owner");

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Roles"
        description="A person's role decides what they can do and which details they see; where they work decides which campers. Change a role here and everyone with it changes at once."
      />
      <ActionForm action={saveRoles} warnUnsaved className="group space-y-4">
        {roles.map((r) => (
          <section key={r} className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="font-semibold">{STAFF_ROLES[r].label}</h2>
              <Link href={`/admin/users?role=${r}`} className="text-xs text-muted-foreground hover:text-primary">
                {plural(count(r), "person", "people")}
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">{STAFF_ROLES[r].description}</p>

            <div className="mt-4 grid gap-4 md:grid-cols-[auto_1fr] md:gap-x-6">
              <span className="pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Can</span>
              <div className="inline-flex w-full flex-wrap gap-1 rounded-lg bg-muted p-1 sm:w-auto">
                {(Object.keys(ACCESS_LEVELS) as AccessLevel[]).map((l) => (
                  <label key={l} className="flex-1 cursor-pointer sm:flex-none" title={ACCESS_LEVELS[l].description}>
                    <input type="radio" name={`level:${r}`} value={l} defaultChecked={setup.levels[r] === l} className="peer sr-only" />
                    <span className="block rounded-md px-3 py-1.5 text-center text-sm text-muted-foreground peer-checked:bg-background peer-checked:font-medium peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                      {ACCESS_LEVELS[l].label}
                    </span>
                  </label>
                ))}
              </div>

              <span className="pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sees</span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(FIELD_GROUPS).map(([g, f]) => (
                  <label key={g} className="cursor-pointer" title={f.description}>
                    <input type="checkbox" name={`see:${g}:${r}`} defaultChecked={setup.sees[r].includes(g)} className="peer sr-only" />
                    <span className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm text-muted-foreground peer-checked:border-primary/40 peer-checked:bg-primary-soft peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring [&>svg]:hidden peer-checked:[&>svg]:block">
                      <Check className="size-3.5" />
                      {f.label}
                    </span>
                  </label>
                ))}
              </div>

              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Also</span>
              <ul className="space-y-0.5 text-sm text-muted-foreground">
                {ROLE_EXTRAS[r].map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </section>
        ))}
        <p className="text-xs text-muted-foreground">
          Everyone sees names, bunks and check-in status for the campers where they work. Without medical details, people still see a medical flag so they know to ask. Owners can do
          and see everything.
        </p>
        <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
          <Button type="submit">Save roles</Button>
          <span className="hidden text-sm font-medium text-amber-700 group-data-[dirty=true]:inline dark:text-amber-300">Unsaved changes</span>
        </div>
      </ActionForm>
    </div>
  );
}
