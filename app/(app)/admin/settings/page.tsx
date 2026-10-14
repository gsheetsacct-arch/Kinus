import { campZoneLabel } from "@/lib/time";
import { Send } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Callout } from "@/components/callout";
import { Section } from "@/components/section";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireAdmin } from "@/lib/auth/current-user";
import { extraAnswers } from "@/lib/data/extra-fields";
import type { ExtraField } from "@/lib/import/extra-fields";
import Link from "next/link";
import { saveExtraFields, saveImportSettings, saveMissingRules, saveOfficeEmail, sendTestEmail } from "./actions";
import { emailSetup } from "@/lib/print/email";
import { parseExtraFields } from "@/lib/import/extra-fields";
import { DEFAULT_RULES, type MissingRules } from "@/lib/attendance/missing";

// tag requests (and the test email) make a PDF in the background
export const maxDuration = 60;

export const metadata = { title: "Settings" };


export default async function SettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: settings } = await supabase.from("settings").select("key, value");
  const setting = (k: string) => (settings?.find((s) => s.key === k)?.value ?? {}) as Record<string, unknown>;
  const officeEmail = setting("office_email");
  const email = emailSetup();
  const imp = setting("import");
  const extraFields = parseExtraFields(settings?.find((x) => x.key === "extra_fields")?.value);
  const session = await getActiveSession();
  const answers = session ? await extraAnswers(session.id, extraFields) : new Map();
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
          <Field label="Flag once this share of their division is here" htmlFor="percent" hint="Percent of the camper's whole division that has arrived. 0 turns this off.">
            <div className="flex items-center gap-2">
              <Input id="percent" name="percent" type="number" min={0} max={100} defaultValue={missing.percent} className="w-24" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </Field>
          <Field label="Or flag everyone still missing after" htmlFor="after_time" hint={`${campZoneLabel()} time (camp time), whatever time zone a phone or the server is in. Leave empty to only use the percentage.`}>
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
              <div key={f.column} className="space-y-2 rounded-lg border p-3">
                <div className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input type="hidden" name="column" value={f.column} />
                  <span className="truncate font-mono text-xs text-muted-foreground">{f.column}</span>
                  <Input name="label" defaultValue={f.label} aria-label={`Name for ${f.column}`} dir="auto" />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={`keep:${f.column}`} defaultChecked className="size-4" /> Show
                  </label>
                </div>
                <ShortAnswers field={f} answers={answers.get(f.column)} />
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
          <div className="mt-5 space-y-2 border-t pt-4 text-sm">
            <p className="text-muted-foreground">
              Sent from <code className="rounded bg-muted px-1">{email.from}</code>
              {!email.configured && " · not set up yet (RESEND_API_KEY missing in Vercel)"}
            </p>
            {email.configured && email.testSender && (
              <Callout tone="warning">
                That&apos;s Resend&apos;s test sender: it only delivers to the Resend account&apos;s own address. To reach the office, verify your camp&apos;s domain at resend.com/domains and set EMAIL_FROM in Vercel to an address on it.
              </Callout>
            )}
            <ActionForm action={sendTestEmail}>
              <Button type="submit" variant="outline" size="sm">
                <Send /> Send a test email
              </Button>
            </ActionForm>
            <p className="text-xs text-muted-foreground">Sends a sample tag as a PDF to the address above, the same way a real request is sent, and tells you if anything is wrong.</p>
          </div>
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

/** Short wording for each different answer (shown on the camper page and in lists). */
function ShortAnswers({ field, answers }: { field: ExtraField; answers: { value: string; count: number }[] | null | undefined }) {
  if (answers === undefined) return null;
  if (answers === null) return <p className="text-xs text-muted-foreground">Answers here are written freely (too many different ones to shorten).</p>;
  if (!answers.length) return <p className="text-xs text-muted-foreground">No answers yet in this session.</p>;
  const set = Object.keys(field.answers ?? {}).filter((k) => field.answers![k]).length;
  return (
    <details className="text-sm" open={answers.some((a) => a.value.length > 25) && !set}>
      <summary className="cursor-pointer text-xs text-muted-foreground">
        Short answers ({answers.length} different{set ? `, ${set} shortened` : ""})
      </summary>
      <div className="mt-2 space-y-1.5">
        <p className="text-xs text-muted-foreground">How each answer shows on the camper page and in lists. Leave empty to show it as it is.</p>
        {answers.map((a) => (
          <div key={a.value} className="grid items-center gap-2 sm:grid-cols-[1fr_220px]">
            <input type="hidden" name={`orig:${field.column}`} value={a.value} />
            <span className="text-xs" dir="auto">
              {a.value} <span className="text-muted-foreground">· {a.count}</span>
            </span>
            <Input
              name={`short:${field.column}`}
              defaultValue={Object.entries(field.answers ?? {}).find(([k]) => k.trim().toLowerCase() === a.value.trim().toLowerCase())?.[1] ?? ""}
              placeholder="Short answer"
              aria-label={`Short answer for ${a.value}`}
              className="h-8"
              dir="auto"
            />
          </div>
        ))}
      </div>
    </details>
  );
}
