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
import { EXTRA_GROUPS, type ExtraField } from "@/lib/import/extra-fields";
import Link from "next/link";
import { resetAttendance, saveExtraFields, saveImportSettings, saveMissingRules, saveOfficeEmail, saveProtectedColumns, sendTestEmail } from "./actions";
import { parseProtected, PROTECTABLE_FIELDS } from "@/lib/import/protected";
import { FormDialog } from "@/components/form-dialog";
import { ResetPicker, type ResetCamp } from "@/components/settings/reset-picker";
import { isOwner } from "@/lib/auth/permissions";
import { emailSetup } from "@/lib/print/email";
import { loadExtraFields, loadHiddenColumns } from "@/lib/data/extra-fields";
import { Select } from "@/components/ui/select";
import { groupOfKey } from "@/lib/fields";
import { FIELD_GROUPS, ROLE_ORDER, STAFF_ROLES } from "@/lib/labels";
import { loadRoles } from "@/lib/data/roles";
import { DEFAULT_RULES, type MissingRules } from "@/lib/attendance/missing";

// tag requests (and the test email) make a PDF in the background
export const maxDuration = 60;

export const metadata = { title: "Settings" };


export default async function SettingsPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { data: settings } = await supabase.from("settings").select("key, value");
  const setting = (k: string) => (settings?.find((s) => s.key === k)?.value ?? {}) as Record<string, unknown>;
  const officeEmail = setting("office_email");
  const email = emailSetup();
  const imp = setting("import");
  const guarded = parseProtected(settings?.find((x) => x.key === "protected_columns")?.value);
  // the export's columns, from the latest upload, to choose from
  const { data: lastImport } = await supabase.from("imports").select("options").order("uploaded_at", { ascending: false }).limit(1).maybeSingle();
  const exportColumns = ((lastImport?.options as { headers?: string[] } | null)?.headers ?? []).filter((h) => h.trim());
  const listed = new Set(exportColumns.map((h) => h.trim().toLowerCase()));
  const otherGuarded = guarded.columns.filter((c) => !listed.has(c.toLowerCase()));
  // every export column Kinus has no field for (named ones first), and the ones left out
  const [extraFields, hiddenColumns] = await Promise.all([loadExtraFields(), loadHiddenColumns()]);
  const session = await getActiveSession();
  const answers = session ? await extraAnswers(session.id, extraFields) : new Map();
  // the reset's picker: each camp and its divisions (a division with no camp is in the first), with how many campers
  let resetCamps: ResetCamp[] = [];
  if (session && isOwner(me)) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { fetchAll } = await import("@/lib/supabase/fetch-all");
    const admin = createAdminClient();
    const [{ data: groups }, { data: divs }, rows] = await Promise.all([
      admin.from("division_groups").select("id, name").eq("session_id", session.id).order("sort_order").order("name"),
      admin.from("divisions").select("id, name, group_id").eq("session_id", session.id).order("sort_order"),
      fetchAll((from, to) => admin.from("campers").select("id, division_id").eq("session_id", session.id).order("id").range(from, to)),
    ]);
    const count = new Map<string, number>();
    for (const r of rows) if (r.division_id) count.set(r.division_id, (count.get(r.division_id) ?? 0) + 1);
    const first = groups?.[0]?.id ?? null;
    const campOf = (d: { group_id: string | null }) => d.group_id ?? first;
    resetCamps = [
      ...(groups ?? []).map((g) => ({ id: g.id, name: g.name, divisions: (divs ?? []).filter((d) => campOf(d) === g.id).map((d) => ({ id: d.id, name: d.name, campers: count.get(d.id) ?? 0 })) })),
      ...(first ? [] : [{ id: "all", name: "Divisions", divisions: (divs ?? []).map((d) => ({ id: d.id, name: d.name, campers: count.get(d.id) ?? 0 })) }]),
    ].filter((c) => c.divisions.length);
  }
  const missing = { ...DEFAULT_RULES, ...(setting("missing_rules") as Partial<MissingRules>) };
  // who sees each detail group now (Staff → Roles), for "Who sees this"
  const roles = await loadRoles(supabase);
  const seenBy = (g: string) =>
    ROLE_ORDER.filter((r) => r !== "owner" && roles.inUse[r] && roles.sees[r].includes(g))
      .map((r) => STAFF_ROLES[r].label)
      .join(", ") || "owners only";
  const groupLabel = (g: string) => (g === "basic" ? "Everyone who sees the camper" : `${FIELD_GROUPS[g]?.label ?? g}: ${seenBy(g)}`);

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
        description="On Who’s here, campers still missing are flagged “check up on” so someone calls home. Nothing is flagged before the first camper of the session arrives."
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
        description="Every column of the registration export that isn't one of Kinus' own fields: on the camper page and Edit tab, in lists and labels. Rename them, untick Show to leave a column out, and choose who sees each one (which roles see each kind of detail is set on Roles)."
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
                {/* who sees it: on the camper page, in lists and their downloads */}
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Who sees this</span>
                  <Select name={`group:${f.column}`} defaultValue={f.group ?? ""} className="h-9 min-w-0 flex-1 basis-64">
                    <option value="">Guessed from the name · {groupLabel(groupOfKey(`source.${f.column}`))}</option>
                    {EXTRA_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {groupLabel(g)}
                      </option>
                    ))}
                  </Select>
                </label>
                <ShortAnswers field={f} answers={answers.get(f.column)} />
              </div>
            ))}
            {hiddenColumns.length > 0 && (
              <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">Left out ({hiddenColumns.length})</summary>
                <p className="mt-1 text-xs text-muted-foreground">Tick one to show it again.</p>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {hiddenColumns.map((c) => (
                    <label key={c} className="flex items-center gap-2">
                      <input type="checkbox" name="unhide" value={c} className="size-4" />
                      <span className="truncate font-mono text-xs">{c}</span>
                    </label>
                  ))}
                </div>
              </details>
            )}
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
        <Section
          title="Protected columns"
          description="Details the office cleans by hand in a copy of the export (medical notes kept for division heads, a version for counselors). Upload that copy with “This is our corrected copy”: whatever it changed or removed in these columns is locked for that camper, and later exports keep it as you left it (also a column only your copy has). Anything you didn't change keeps updating from the export, including information that arrives later."
        >
          <ActionForm action={saveProtectedColumns} warnUnsaved className="group space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Camper details</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {PROTECTABLE_FIELDS.map((f) => (
                  <label key={f.field} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="field" value={f.field} defaultChecked={guarded.fields.includes(f.field)} className="size-4 accent-[var(--primary)]" />
                    {f.label}
                  </label>
                ))}
              </div>
            </fieldset>
            {exportColumns.length > 0 && (
              <details open={guarded.columns.length > 0}>
                <summary className="cursor-pointer text-sm font-medium">Columns of the export ({guarded.columns.length} protected)</summary>
                <div className="mt-2 grid max-h-72 gap-1.5 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
                  {exportColumns.map((h) => (
                    <label key={h} className="flex items-center gap-2 text-sm" dir="auto">
                      <input type="checkbox" name="column" value={h} defaultChecked={guarded.columns.some((c) => c.toLowerCase() === h.trim().toLowerCase())} className="size-4 accent-[var(--primary)]" />
                      <span className="truncate">{h}</span>
                    </label>
                  ))}
                </div>
              </details>
            )}
            <Field label="Columns only in your corrected copy (one a line)" htmlFor="more" hint="A column you add by hand (e.g. “Medical for counselors”): it's kept even though the regular export doesn't have it.">
              <textarea id="more" name="more" rows={2} defaultValue={otherGuarded.join("\n")} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" dir="auto" />
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
      {isOwner(me) && session && (
        <Section
          tone="danger"
          title="Reset check-ins"
          description={`Starts check-in over for the camps or divisions you pick in ${session.name}: their check-ins and check-outs are removed, with the follow-ups (coming later, notes), and their campers are not here yet again. Campers, bunks, tags and buzzer numbers stay. Only the owner can do this, and it can't be undone.`}
        >
          <FormDialog
            trigger={<Button variant="destructive">Reset check-ins…</Button>}
            title="Reset check-ins and check-outs"
            description={`Pick which camps or divisions in ${session.name} start over. Their campers go back to not here yet, and their check-in history is gone for good.`}
            action={resetAttendance}
            submitLabel="Reset check-ins"
            destructive
            confirmText="RESET"
            wide
          >
            <ResetPicker camps={resetCamps} />
          </FormDialog>
        </Section>
      )}
    </div>
  );
}

/** Short wording for each different answer (shown on the camper page and in lists). */
function ShortAnswers({ field, answers }: { field: ExtraField; answers: { value: string; count: number }[] | null | undefined }) {
  if (answers === undefined) return null;
  if (answers === null) return <p className="text-xs text-muted-foreground">Answers here are written freely (too many different ones to shorten).</p>;
  if (!answers.length) return <p className="text-xs text-muted-foreground">No answers yet in this session.</p>;
  const set = Object.keys(field.answers ?? {}).filter((k) => field.answers![k]).length + (field.hide?.length ?? 0);
  return (
    <details className="text-sm" open={answers.some((a) => a.value.length > 25) && !set}>
      <summary className="cursor-pointer text-xs text-muted-foreground">
        Short answers ({answers.length} different{set ? `, ${set} shortened` : ""})
      </summary>
      <div className="mt-2 space-y-1.5">
        <p className="text-xs text-muted-foreground">How each answer shows on the camper page and in lists. Leave empty to show it as it is; Hide for an answer that means nothing special (“No”, “None”): it shows nothing at all.</p>
        {answers.map((a) => (
          <div key={a.value} className="grid items-center gap-2 sm:grid-cols-[1fr_220px_auto]">
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
            <label className="flex items-center gap-1.5 text-xs whitespace-nowrap" title="Show nothing for this answer">
              <input type="checkbox" name={`hide:${field.column}`} value={a.value} defaultChecked={(field.hide ?? []).some((h) => h.trim().toLowerCase() === a.value.trim().toLowerCase())} className="size-4" /> Hide
            </label>
          </div>
        ))}
      </div>
    </details>
  );
}
