import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import Link from "next/link";
import { saveExtraFields, saveImportSettings, saveMissingRules, saveOfficeEmail } from "./actions";
import { parseExtraFields } from "@/lib/import/extra-fields";
import { DEFAULT_RULES, type MissingRules } from "@/lib/attendance/missing";

export const metadata = { title: "Settings" };


export default async function SettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: settings } = await supabase.from("settings").select("key, value");
  const setting = (k: string) => (settings?.find((s) => s.key === k)?.value ?? {}) as Record<string, unknown>;
  const officeEmail = setting("office_email");
  const imp = setting("import");
  const extraFields = parseExtraFields(settings?.find((x) => x.key === "extra_fields")?.value);
  const missing = { ...DEFAULT_RULES, ...(setting("missing_rules") as Partial<MissingRules>) };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />

      <Section title="Who can see and do what" description="Set per role: whether they view, check in & out, or edit, and which details (contacts, medical…) they see.">
        <Button asChild variant="outline">
          <Link href="/admin/roles">Open Roles</Link>
        </Button>
      </Section>

      <Section
        title="Campers who haven't arrived"
        description="On “Not here yet”, campers still missing are flagged “check up on” so someone calls home. Nothing is flagged before the first camper of the session arrives."
      >
        <ActionForm action={saveMissingRules} warnUnsaved className="group grid gap-4 sm:grid-cols-2">
          <Field label="Flag once this share of their bunk is here" htmlFor="percent" hint="0 turns this off. Campers without a bunk count against their division.">
            <div className="flex items-center gap-2">
              <Input id="percent" name="percent" type="number" min={0} max={100} defaultValue={missing.percent} className="w-24" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </Field>
          <Field label="Or flag everyone still missing after" htmlFor="after_time" hint="Camp time. Leave empty to only use the percentage.">
            <Input id="after_time" name="after_time" type="time" defaultValue={missing.after_time ?? ""} className="w-36" />
          </Field>
          <div className="sm:col-span-2">
            <span className="flex items-center gap-3">
              <Button type="submit">Save</Button>
              <span className="hidden text-sm font-medium text-amber-700 group-data-[dirty=true]:inline dark:text-amber-300">Unsaved changes</span>
            </span>
          </div>
        </ActionForm>
      </Section>

      <Section
        title="Extra fields from the export"
        description="Columns of the registration export shown on the camper page, and offered for lists and labels. Choose them on the import's column step (“Show on the camper page”); rename or remove them here."
      >
        {extraFields.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ActionForm action={saveExtraFields} warnUnsaved className="group space-y-3">
            {extraFields.map((f) => (
              <div key={f.column} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input type="hidden" name="column" value={f.column} />
                <span className="truncate font-mono text-xs text-muted-foreground">{f.column}</span>
                <Input name="label" defaultValue={f.label} aria-label={`Name for ${f.column}`} dir="auto" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={`keep:${f.column}`} defaultChecked className="size-4" /> Show
                </label>
              </div>
            ))}
            <span className="flex items-center gap-3">
              <Button type="submit">Save</Button>
              <span className="hidden text-sm font-medium text-amber-700 group-data-[dirty=true]:inline dark:text-amber-300">Unsaved changes</span>
            </span>
          </ActionForm>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Office email" description="Name tag and luggage tag requests are emailed here. Staff can change the address for a single request.">
          <ActionForm action={saveOfficeEmail} warnUnsaved className="group space-y-4">
            <Field label="Send to" htmlFor="to">
              <Input id="to" name="to" type="email" defaultValue={String(officeEmail.to ?? "")} placeholder="office@example.com" />
            </Field>
            <Field label="Also copy (optional)" htmlFor="cc" hint="Separate several addresses with commas.">
              <Input id="cc" name="cc" defaultValue={Array.isArray(officeEmail.cc) ? (officeEmail.cc as string[]).join(", ") : ""} />
            </Field>
            <span className="flex items-center gap-3">
              <Button type="submit">Save</Button>
              <span className="hidden text-sm font-medium text-amber-700 group-data-[dirty=true]:inline dark:text-amber-300">Unsaved changes</span>
            </span>
          </ActionForm>
        </Section>
        <Section title="Imports" description="Get a clear warning when an uploaded export looks incomplete.">
          <ActionForm action={saveImportSettings} warnUnsaved className="group space-y-4">
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
            <span className="flex items-center gap-3">
              <Button type="submit">Save</Button>
              <span className="hidden text-sm font-medium text-amber-700 group-data-[dirty=true]:inline dark:text-amber-300">Unsaved changes</span>
            </span>
          </ActionForm>
        </Section>
      </div>
    </div>
  );
}
