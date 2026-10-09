import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { FIELD_GROUPS, STAFF_ROLES } from "@/lib/labels";
import type { StaffRole } from "@/lib/auth/permissions";
import { saveFieldVisibility, saveImportSettings, saveOfficeEmail } from "./actions";

export const metadata = { title: "Settings" };

const COLS: StaffRole[] = ["director", "division_head", "head_counselor", "counselor", "scanner", "office", "logistics"];
const ORDER = ["contacts", "medical", "parent_notes", "address", "staff_notes"];

export default async function SettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: fv }, { data: settings }] = await Promise.all([
    supabase.from("field_visibility").select("field_group, roles"),
    supabase.from("settings").select("key, value"),
  ]);
  const rows = [...(fv ?? [])].sort((a, b) => ORDER.indexOf(a.field_group) - ORDER.indexOf(b.field_group));
  const setting = (k: string) => (settings?.find((s) => s.key === k)?.value ?? {}) as Record<string, unknown>;
  const officeEmail = setting("office_email");
  const imp = setting("import");

  const Box = ({ name, checked }: { name: string; checked: boolean }) => (
    <td className="px-2 py-3 text-center">
      <input type="checkbox" name={name} defaultChecked={checked} className="size-5 accent-[var(--primary)]" />
    </td>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />

      <Section
        title="Who can see sensitive details"
        description="Everyone sees names, bunks and check-in status for the campers in their area. Tick who also sees these details, again only for campers in their area. Without medical access, people still see a “medical flag” so they know to ask."
      >
        <ActionForm action={saveFieldVisibility} className="space-y-5">
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-medium">Detail</th>
                  {COLS.map((r) => (
                    <th key={r} className="px-2 py-2 font-medium">
                      {STAFF_ROLES[r].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.field_group} className="border-t">
                    <td className="py-3 pr-3">
                      <input type="hidden" name="group" value={row.field_group} />
                      <div className="font-medium">{FIELD_GROUPS[row.field_group]?.label ?? row.field_group}</div>
                      <div className="text-xs text-muted-foreground">{FIELD_GROUPS[row.field_group]?.description}</div>
                    </td>
                    {COLS.map((r) => (
                      <Box key={r} name={`${row.field_group}:${r}`} checked={row.roles.includes(r)} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Owners always see everything. A person only ever sees campers in their own area.</p>
          <Button type="submit">Save</Button>
        </ActionForm>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Office email" description="Name tag and luggage tag requests are emailed here. Staff can change the address for a single request.">
          <ActionForm action={saveOfficeEmail} className="space-y-4">
            <Field label="Send to" htmlFor="to">
              <Input id="to" name="to" type="email" defaultValue={String(officeEmail.to ?? "")} placeholder="office@example.com" />
            </Field>
            <Field label="Also copy (optional)" htmlFor="cc" hint="Separate several addresses with commas.">
              <Input id="cc" name="cc" defaultValue={Array.isArray(officeEmail.cc) ? (officeEmail.cc as string[]).join(", ") : ""} />
            </Field>
            <Button type="submit">Save</Button>
          </ActionForm>
        </Section>
        <Section title="Imports" description="Get a clear warning when an uploaded export looks incomplete.">
          <ActionForm action={saveImportSettings} className="space-y-4">
            <Field
              label="Warn when this share of a division is missing from the file"
              htmlFor="missingThresholdPct"
              hint="For example 20 means: warn if more than 1 in 5 campers of a division aren't in the new file."
            >
              <div className="flex items-center gap-2">
                <Input id="missingThresholdPct" name="missingThresholdPct" type="number" min={0} max={100} defaultValue={Number(imp.missingThresholdPct ?? 20)} className="w-24" />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </Field>
            <Button type="submit">Save</Button>
          </ActionForm>
        </Section>
      </div>
    </div>
  );
}
