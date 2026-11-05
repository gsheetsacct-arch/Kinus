import { extraGroupOf, loadExtraFields } from "@/lib/data/extra-fields";
import { parseCombos, parseCopies, parseWhere } from "@/lib/data/lists";
import { ComboBuilder } from "@/components/lists/combo-builder";
import { LayoutFilters } from "@/components/lists/layout-filters";
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
  // filters on any field ("T-shirt size is M or L", "Grade is 4")
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
            <Field label="Copies of each when printed" htmlFor="copies" hint="Grouped by bunk: each bunk's page prints this many times, one after another (three for the bunk, the counselor and the office), instead of the whole list over again.">
              <Select id="copies" name="copies" defaultValue={String(parseCopies((preset?.filters as { copies?: unknown } | null)?.copies))}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "1 (once)" : n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sort campers by" htmlFor="sort_field" hint="Any field, an export column or a combined column on the layout; campers with the same answer go by name.">
              <Select id="sort_field" name="sort_field" defaultValue={sortField}>
                <option value="last_name">Last name</option>
                <option value="first_name">First name</option>
                {combos.length > 0 && (
                  <optgroup label="Combined columns">
                    {combos.map((c) => (
                      <option key={c.id} value={`combo:${c.id}`}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                {byKind.map((k) => (
                  <optgroup key={k.title} label={k.title}>
                    {k.options
                      .filter((o) => o.key !== "last_name" && o.key !== "first_name" && !o.key.startsWith("contact."))
                      .map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <fieldset className="space-y-2 rounded-xl border p-3">
              <legend className="px-1 text-sm font-medium">Only campers who have</legend>
              <div className="flex flex-wrap gap-1.5">
                {FLAG_KEYS.map((k) => (
                  <label key={k} className="cursor-pointer">
                    <input type="checkbox" name="only" value={k} defaultChecked={only.has(k)} className="peer sr-only" />
                    <span className="inline-flex items-center rounded-full border bg-background px-2.5 py-1 text-xs transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:border-primary/50">
                      {CAMPER_FLAGS[k].label}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-muted-foreground">More than one picked:</span>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="match" value="any" defaultChecked={match === "any"} className="size-3.5 accent-[var(--primary)]" />
                  any of them
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="match" value="all" defaultChecked={match === "all"} className="size-3.5 accent-[var(--primary)]" />
                  all of them
                </label>
              </div>
              <p className="text-xs text-muted-foreground">None picked: every camper.</p>
            </fieldset>
            <fieldset className="space-y-2 rounded-xl border p-3">
              <legend className="px-1 text-sm font-medium">Only campers whose…</legend>
              <LayoutFilters kinds={byKind} initial={where} />
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
