import Link from "next/link";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/current-user";
import { ACCESS_LEVELS, FIELD_GROUPS, ROLE_EXTRAS, ROLE_ORDER, STAFF_ROLES } from "@/lib/labels";
import { KEPT_ROLES, loadRoles } from "@/lib/data/roles";
import type { AccessLevel } from "@/lib/auth/permissions";
import { plural } from "@/lib/utils";
import { saveColumnGroups, saveRoles, setRoleInUse } from "./actions";
import { Select } from "@/components/ui/select";
import { FIELDS, groupOfKey } from "@/lib/fields";
import { EXTRA_GROUPS, parseExtraFields } from "@/lib/import/extra-fields";

export const metadata = { title: "Roles" };

export default async function RolesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [setup, { data: people }, { data: extraRow }] = await Promise.all([
    loadRoles(supabase),
    createAdminClient().from("profiles").select("role").eq("is_active", true),
    supabase.from("settings").select("value").eq("key", "extra_fields").maybeSingle(),
  ]);
  const extra = parseExtraFields(extraRow?.value);
  // who sees each kind of detail now, in words
  const seenBy = (g: string) =>
    ROLE_ORDER.filter((r) => r !== "owner" && setup.inUse[r] && setup.sees[r].includes(g))
      .map((r) => STAFF_ROLES[r].label)
      .join(", ") || "Owners only";
  const groupOf = (f: (typeof extra)[number]) => f.group ?? groupOfKey(`source.${f.column}`);
  const groupLabel = (g: string) => (g === "basic" ? "Everyone who sees the camper" : (FIELD_GROUPS[g]?.label ?? g));
  const count = (r: string) => (people ?? []).filter((p) => p.role === r).length;
  const roles = ROLE_ORDER.filter((r) => r !== "owner" && setup.inUse[r]);
  const removed = ROLE_ORDER.filter((r) => !setup.inUse[r]);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Roles"
        description="A person's role decides what they can do and which details they see; where they work decides which campers. Change a role here and everyone with it changes at once. A role nobody has can be removed."
      />
      <ActionForm action={saveRoles} warnUnsaved className="group space-y-4">
        {roles.map((r) => (
          <section key={r} className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="font-semibold">{STAFF_ROLES[r].label}</h2>
              <div className="flex items-center gap-3">
                <Link href={`/admin/users?role=${r}`} className="text-xs text-muted-foreground hover:text-primary">
                  {plural(count(r), "person", "people")}
                </Link>
                {!KEPT_ROLES.includes(r) &&
                  (count(r) === 0 ? (
                    <Button type="submit" form={`remove-${r}`} variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5" /> Remove role
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground/70" title="Give its people another role first, then it can be removed.">
                      In use
                    </span>
                  ))}
              </div>
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

      {/* outside the main form (forms can't nest); the Remove buttons above point here */}
      {/* what each kind of detail covers, and which kind each added column is */}
      <section className="mt-8 space-y-3">
        <div>
          <h2 className="font-semibold">What each kind of detail covers</h2>
          <p className="text-sm text-muted-foreground">
            The details above are these fields. Names, bunks, status and the medical flag are for everyone who sees the camper. Added columns from the export go wherever you put them below.
          </p>
        </div>
        <div className="divide-y rounded-xl border bg-card">
          {Object.entries(FIELD_GROUPS).map(([g, info]) => {
            const fields = FIELDS.filter((f) => f.group === g && !f.key.startsWith("contact.")).map((f) => f.label);
            if (g === "contacts") fields.unshift("Mother, father and emergency contacts (names, phones, emails)");
            const cols = extra.filter((f) => groupOf(f) === g).map((f) => f.label);
            return (
              <div key={g} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[12rem_1fr] sm:gap-4">
                <span className="font-medium">{info.label}</span>
                <span className="space-y-0.5">
                  <span className="block">{[...fields, ...cols.map((c) => `${c} (added column)`)].join(" · ") || <span className="text-muted-foreground">Only added columns you put here</span>}</span>
                  <span className="block text-xs text-muted-foreground">Seen by: {seenBy(g)}</span>
                </span>
              </div>
            );
          })}
        </div>

        {extra.length > 0 && (
          <ActionForm action={saveColumnGroups} warnUnsaved className="group space-y-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
            <div>
              <h3 className="font-semibold">Added columns: who sees each one</h3>
              <p className="text-sm text-muted-foreground">Columns from the registration export shown on the camper page and in lists. Put a sensitive one (a family situation) in its kind of detail, so only those roles see it.</p>
            </div>
            <ul className="divide-y">
              {extra.map((f) => (
                <li key={f.column} className="grid items-center gap-2 py-2 sm:grid-cols-[1fr_minmax(16rem,22rem)]">
                  <span className="min-w-0">
                    <span className="block truncate font-medium" dir="auto">
                      {f.label}
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{f.column}</span>
                  </span>
                  <Select name={`group:${f.column}`} defaultValue={f.group ?? ""} aria-label={`Who sees ${f.label}`} className="h-9">
                    <option value="">Guessed from the name: {groupLabel(groupOfKey(`source.${f.column}`))}</option>
                    {EXTRA_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {groupLabel(g)}
                        {g === "basic" ? "" : ` (${seenBy(g)})`}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
            <span className="flex items-center gap-3">
              <Button type="submit">Save</Button>
              <span className="hidden text-sm font-medium text-amber-700 group-data-[dirty=true]:inline dark:text-amber-300">Unsaved changes</span>
            </span>
          </ActionForm>
        )}
      </section>

      {roles
        .filter((r) => !KEPT_ROLES.includes(r) && count(r) === 0)
        .map((r) => (
          <ActionForm
            key={r}
            id={`remove-${r}`}
            action={setRoleInUse}
            confirm={`Remove the ${STAFF_ROLES[r].label} role?`}
            confirmDetail="It won't be offered when adding or changing staff. Nobody has it now. You can bring it back any time."
            confirmLabel="Remove role"
            danger
            className="hidden"
          >
            <input type="hidden" name="role" value={r} />
          </ActionForm>
        ))}

      {removed.length > 0 && (
        <section className="mt-8 space-y-2">
          <h2 className="text-sm font-semibold">Removed roles</h2>
          <p className="text-xs text-muted-foreground">Not offered when adding or changing staff. Bring one back if you need it again; it keeps what it could do and see.</p>
          <ul className="divide-y rounded-xl border bg-card">
            {removed.map((r) => (
              <li key={r} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-sm">
                  <span className="font-medium">{STAFF_ROLES[r].label}</span>
                  <span className="text-muted-foreground"> · {STAFF_ROLES[r].description}</span>
                  {count(r) > 0 && <span className="text-muted-foreground"> · {plural(count(r), "person", "people")} still have it</span>}
                </span>
                <ActionForm action={setRoleInUse}>
                  <input type="hidden" name="role" value={r} />
                  <input type="hidden" name="in_use" value="on" />
                  <Button type="submit" variant="outline" size="sm">
                    <RotateCcw className="size-3.5" /> Bring back
                  </Button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
