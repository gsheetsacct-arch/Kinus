import { extraGroupOf, loadExtraFields } from "@/lib/data/extra-fields";
import { parseCombos, parseWhere } from "@/lib/data/lists";
import { ComboBuilder } from "@/components/lists/combo-builder";
import { notFound } from "next/navigation";
import { Copy, Lock } from "lucide-react";
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
import { copyPreset, deletePreset, savePreset } from "../actions";
import { CAMPER_FLAGS, FLAG_KEYS, parseFlags } from "@/lib/camper-flags";
import { SLEEPING_COLUMN, SLEEPING_COLUMN_LABEL } from "@/lib/sleeping";

export const metadata = { title: "List layout" };

const GROUP_TITLES: { group: FieldGroup | "basic+status"; title: string }[] = [
  { group: "basic+status", title: "Camper" },
  { group: "contacts", title: "Contacts" },
  { group: "medical", title: "Medical" },
  { group: "address", title: "Address" },
  { group: "parent_notes", title: "Notes from parents" },
  { group: "staff_notes", title: "Staff notes" },
  { group: "family", title: "Family situations" },
];

export default async function PresetEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === "new";
  const supabase = await createClient();
  const preset = isNew ? null : (await supabase.from("list_presets").select("*").eq("id", id).maybeSingle()).data;
  if (!isNew && !preset) notFound();
  const columns = new Set((preset?.columns as string[] | undefined) ?? ["display_name", "bunk"]);
  const extraFields = await loadExtraFields();
  const sort = (preset?.sort as { field: string; dir: string }[] | undefined) ?? [];
  const only = new Set(parseFlags(((preset?.filters as { only?: string[] } | null)?.only ?? []).join(",")));
  const match = (preset?.filters as { match?: string } | null)?.match === "all" ? "all" : "any";
  // column filters ("T-shirt size is M or L"): the saved ones, then empty rows to add more
  const where = parseWhere(preset?.filters);
  // combined columns: the saved ones, then a blank one to make another
  const combos = parseCombos(preset?.filters);
  // everything a combined column (or grouping) can use, by kind: Kinus' fields, Sleeping, and every
  // export column under the kind chosen for it in Settings
  const byKind = GROUP_TITLES.map(({ group, title }) => {
    const inGroup = (g: string) => (group === "basic+status" ? UNGATED_GROUPS.includes(g as FieldGroup) : g === group);
    return {
      title,
      options: [
        ...FIELDS.filter((f) => inGroup(f.group)).map((f) => ({ key: f.key, label: f.label })),
        ...(group === "basic+status" ? [{ key: SLEEPING_COLUMN, label: SLEEPING_COLUMN_LABEL }] : []),
        ...extraFields.filter((f) => inGroup(extraGroupOf(f))).map((f) => ({ key: `source.${f.column}`, label: `${f.label} (export)` })),
      ],
    };
  }).filter((k) => k.options.length);
  const partOptions = byKind.flatMap((k) => k.options);
  const groupBy = preset?.group_by ?? (isNew ? "bunk" : "");
  const whereRows = [...where, ...Array.from({ length: Math.max(1, 3 - where.length) }, () => ({ column: "", values: [] as string[] }))].slice(0, 5);
  const sortField = sort.find((s) => s.field !== preset?.group_by)?.field ?? "last_name";

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/presets", label: "List layouts" }}
        title={isNew ? "New list layout" : preset!.name}
        actions={
          !isNew && (
            <ActionForm action={copyPreset}>
              <input type="hidden" name="id" value={preset!.id} />
              <Button type="submit" variant="outline" title="A copy to change, keeping this one as it is">
                <Copy /> Make a copy
              </Button>
            </ActionForm>
          )
        }
      />
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
            <Field label="Group the list by" htmlFor="group_by" hint="A heading for each bunk, division, or each answer of any field (e.g. Sleeping here / Going home, or each T-shirt size).">
              <Select id="group_by" name="group_by" defaultValue={groupBy}>
                <option value="bunk">Bunk (one page per bunk when printed)</option>
                <option value="division">Division</option>
                <option value="">Don&apos;t group</option>
                {byKind.map((k) => (
                  <optgroup key={k.title} label={`By ${k.title.toLowerCase()}`}>
                    {k.options
                      .filter((o) => o.key !== "bunk" && o.key !== "division" && !o.key.startsWith("contact."))
                      .map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
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
            <fieldset className="space-y-1.5">
              <legend className="mb-1 text-sm font-medium">Only campers who have</legend>
              {FLAG_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="only" value={k} defaultChecked={only.has(k)} className="size-4 accent-[var(--primary)]" />
                  {CAMPER_FLAGS[k].label}
                </label>
              ))}
              <div className="flex flex-wrap items-center gap-3 pt-1 text-sm">
                <span className="text-muted-foreground">With more than one ticked:</span>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="match" value="any" defaultChecked={match === "any"} className="size-4 accent-[var(--primary)]" />
                  any of them
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="match" value="all" defaultChecked={match === "all"} className="size-4 accent-[var(--primary)]" />
                  all of them
                </label>
              </div>
              <p className="text-xs text-muted-foreground">None ticked: every camper. Any of them: campers with at least one (medical flag or notes). All of them: only campers with every one ticked.</p>
            </fieldset>
            <fieldset className="space-y-1.5">
              <legend className="mb-1 text-sm font-medium">Only campers whose…</legend>
              {whereRows.map((w, i) => (
                <div key={i} className="grid gap-1.5 sm:grid-cols-2">
                  <Select name="where_column" defaultValue={w.column} aria-label="Column">
                    <option value="">(no filter)</option>
                    {extraFields.map((f) => (
                      <option key={f.column} value={f.column}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                  <Input name="where_values" defaultValue={w.values.join(", ")} placeholder="is, e.g. Yes or M, L" aria-label="Values" dir="auto" />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Any column of the export. Separate values with commas (any of them matches); &ldquo;(empty)&rdquo; for campers with nothing in it. Every filter here must match.</p>
            </fieldset>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="is_default" defaultChecked={preset?.is_default ?? false} className="mt-0.5 size-4" />
              <span>Open this layout first for that role</span>
            </label>
            <Button type="submit" className="w-full">
              Save layout
            </Button>
          </div>
        </Section>
        <div className="space-y-6">
        <Section
          title="Columns"
          description="Tick the columns to show. To put several in one column: hold Ctrl (⌘ on a Mac) and click them, or long-press on a phone, then choose Group at the top of the screen. Each kind holds Kinus' own fields and the export's columns of that kind (Settings → who sees each)."
        >
          <div className="space-y-5">
            {GROUP_TITLES.map(({ group, title }) => {
              // Kinus' own fields, then the export's columns of the same kind (Settings → who sees each)
              const inGroup = (g: string) => (group === "basic+status" ? UNGATED_GROUPS.includes(g as FieldGroup) : g === group);
              const fields = [
                ...FIELDS.filter((f) => inGroup(f.group)).map((f) => ({ key: f.key, label: f.label, fromExport: false })),
                ...(group === "basic+status" ? [{ key: SLEEPING_COLUMN, label: `${SLEEPING_COLUMN_LABEL} (Sleeping here / Going home)`, fromExport: false }] : []),
                ...extraFields.filter((f) => inGroup(extraGroupOf(f))).map((f) => ({ key: `source.${f.column}`, label: f.label, fromExport: true })),
              ];
              if (!fields.length) return null;
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
                      <label
                        key={f.key}
                        data-field={f.key}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm select-none hover:bg-muted/40 has-[:checked]:border-primary/50 has-[:checked]:bg-primary-soft/40 data-[grouping=on]:border-amber-500 data-[grouping=on]:bg-amber-50 data-[grouping=on]:ring-2 data-[grouping=on]:ring-amber-400 dark:data-[grouping=on]:bg-amber-950/40"
                      >
                        <input type="checkbox" name="columns" value={f.key} defaultChecked={columns.has(f.key)} className="size-4 accent-[var(--primary)]" />
                        <span className="min-w-0 truncate" dir="auto">
                          {f.label}
                        </span>
                        {f.fromExport && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">export</span>}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </Section>
        <Section
          title="Combined columns"
          description="Several fields in one column, to take less room on a printed list: e.g. “M · Sleeping here · 6¾”. Tick fields in Columns and combine them; make as many as you like. Empty values are left out; a yes/no field shows its name when yes. Combined columns come after the others."
        >
          <ComboBuilder initial={combos.map((c) => ({ ...c, show: columns.has(`combo:${c.id}`) }))} options={partOptions} />
        </Section>
        </div>
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
