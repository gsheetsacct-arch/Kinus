import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { ActionForm } from "@/components/action-form";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { FIELDS, UNGATED_GROUPS, type FieldGroup } from "@/lib/fields";
import { AUDIENCES, FIELD_GROUPS } from "@/lib/labels";
import { deletePreset, savePreset } from "../actions";

const GROUP_TITLES: { group: FieldGroup | "basic+status"; title: string }[] = [
  { group: "basic+status", title: "Camper" },
  { group: "contacts", title: "Contacts" },
  { group: "medical", title: "Medical" },
  { group: "address", title: "Address" },
  { group: "parent_notes", title: "Notes from parents" },
  { group: "staff_notes", title: "Staff notes" },
];

export default async function PresetEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === "new";
  const supabase = await createClient();
  const preset = isNew ? null : (await supabase.from("list_presets").select("*").eq("id", id).maybeSingle()).data;
  if (!isNew && !preset) notFound();
  const columns = new Set((preset?.columns as string[] | undefined) ?? ["display_name", "bunk"]);
  const sort = (preset?.sort as { field: string; dir: string }[] | undefined) ?? [];
  const sortField = sort.find((s) => s.field !== preset?.group_by)?.field ?? "last_name";

  return (
    <div className="space-y-6">
      <PageHeader back={{ href: "/admin/presets", label: "List layouts" }} title={isNew ? "New list layout" : preset!.name} />
      <ActionForm action={savePreset} className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <input type="hidden" name="id" value={preset?.id ?? ""} />
        <Section title="About this layout">
          <div className="space-y-4">
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" defaultValue={preset?.name ?? ""} required placeholder="e.g. Counselor bunk list" />
            </Field>
            <Field label="Who uses it" htmlFor="audience" hint="People see the layouts for their role on the Lists page.">
              <Select id="audience" name="audience" defaultValue={preset?.audience ?? "counselor"}>
                {Object.entries(AUDIENCES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Group the list by" htmlFor="group_by">
              <Select id="group_by" name="group_by" defaultValue={preset?.group_by ?? "bunk"}>
                <option value="bunk">Bunk (one page per bunk when printed)</option>
                <option value="division">Division</option>
                <option value="">Don&apos;t group</option>
              </Select>
            </Field>
            <Field label="Sort campers by" htmlFor="sort_field">
              <Select id="sort_field" name="sort_field" defaultValue={sortField}>
                <option value="last_name">Last name</option>
                <option value="first_name">First name</option>
                <option value="grade">Grade</option>
                <option value="camper_code">Camper code</option>
              </Select>
            </Field>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="is_default" defaultChecked={preset?.is_default ?? false} className="mt-0.5 size-4" />
              <span>Open this layout first for that role</span>
            </label>
            <Button type="submit" className="w-full">
              Save layout
            </Button>
          </div>
        </Section>
        <Section title="Columns" description="Tick the columns to show, in this order.">
          <div className="space-y-5">
            {GROUP_TITLES.map(({ group, title }) => {
              const fields = FIELDS.filter((f) => (group === "basic+status" ? UNGATED_GROUPS.includes(f.group) : f.group === group));
              const gated = group !== "basic+status";
              return (
                <fieldset key={group} className="space-y-2">
                  <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    {title}
                    {gated && (
                      <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                        <Lock className="size-3" /> only for people allowed to see {FIELD_GROUPS[group]?.label.toLowerCase()}
                      </span>
                    )}
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {fields.map((f) => (
                      <label key={f.key} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted/40 has-[:checked]:border-primary/50 has-[:checked]:bg-primary-soft/40">
                        <input type="checkbox" name="columns" value={f.key} defaultChecked={columns.has(f.key)} className="size-4 accent-[var(--primary)]" />
                        {f.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </Section>
      </ActionForm>
      {!isNew && (
        <Section tone="danger" title="Delete this layout" description="People who use it will see the other layouts for their role instead.">
          <FormDialog trigger={<Button variant="destructive">Delete layout</Button>} title={`Delete “${preset!.name}”?`} action={deletePreset} submitLabel="Delete" destructive>
            <input type="hidden" name="id" value={preset!.id} />
          </FormDialog>
        </Section>
      )}
    </div>
  );
}
