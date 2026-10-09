import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Callout } from "@/components/callout";
import { Steps, IMPORT_STEPS } from "@/components/steps";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { TARGET_OPTIONS, type ColumnMap, type MappingOptions } from "@/lib/import";
import { previewImport } from "../../actions";

function ColumnRow({ header, value, samples, highlight }: { header: string; value: string; samples: string[]; highlight?: boolean }) {
  return (
    <div className={`grid gap-2 border-b px-4 py-3 last:border-0 sm:grid-cols-[1fr_1fr_240px] sm:items-center ${highlight ? "bg-amber-50/70 dark:bg-amber-950/20" : ""}`}>
      <div className="min-w-0">
        <div className="truncate font-mono text-xs">{header}</div>
      </div>
      <div className="min-w-0 truncate text-xs text-muted-foreground" dir="auto">
        {samples.length ? samples.join(" · ") : <em>empty in the first rows</em>}
      </div>
      <Select name={`map:${header}`} defaultValue={value} className="h-9 text-sm" aria-label={`Kinus field for ${header}`}>
        {TARGET_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value === "" ? "Don't import" : o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

export default async function MapPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const { data: imp } = await supabase.from("imports").select("id, file_name, status, mapping_id, options").eq("id", id).maybeSingle();
  if (!imp) notFound();
  if (imp.status !== "uploaded" && imp.status !== "previewed") redirect(`/admin/imports/${id}`);
  const opts = imp.options as { headers?: string[]; columnMap?: ColumnMap; mappingOptions?: MappingOptions; takeBunksFromFile?: boolean; emptyMeansUnknown?: boolean };
  const headers = opts.headers ?? [];
  let presetMap: ColumnMap = opts.columnMap ?? {};
  let presetOptions: MappingOptions = opts.mappingOptions ?? {};
  if (!opts.columnMap && imp.mapping_id) {
    const { data: m } = await supabase.from("import_mappings").select("column_map, options").eq("id", imp.mapping_id).maybeSingle();
    presetMap = (m?.column_map as ColumnMap) ?? {};
    presetOptions = (m?.options as MappingOptions) ?? {};
  }
  const { data: sample } = await supabase.from("import_rows").select("raw").eq("import_id", id).order("row_number").limit(25);
  const samples = (sample ?? []).map((r) => r.raw as Record<string, string>);
  const sampleFor = (h: string) => [...new Set(samples.map((s) => s[h]).filter(Boolean))].slice(0, 2);
  const { count } = await supabase.from("import_rows").select("id", { count: "exact", head: true }).eq("import_id", id);
  const known = headers.filter((h) => h in presetMap);
  const unknown = headers.filter((h) => !(h in presetMap));
  const missing = Object.keys(presetMap).filter((h) => !headers.includes(h));

  return (
    <div className="max-w-4xl">
      <PageHeader back={{ href: "/admin/imports", label: "Import roster" }} title="Match the columns" description={<span dir="auto">{imp.file_name} · {count ?? 0} campers in the file</span>} />
      <Steps steps={IMPORT_STEPS} current={2} />
      <ActionForm action={previewImport} className="space-y-6">
        <input type="hidden" name="id" value={imp.id} />
        {unknown.length === 0 && missing.length === 0 ? (
          <Callout tone="success" title={`All ${headers.length} columns were recognised`}>
            Nothing to do here unless the export changed. Press <strong>Review changes</strong>.
          </Callout>
        ) : (
          <Callout tone="warning" title={`${known.length} of ${headers.length} columns were recognised`}>
            {unknown.length > 0 && <>Check the {unknown.length} highlighted {unknown.length === 1 ? "column" : "columns"} below. Columns you don&apos;t import are still kept with each camper. </>}
            {missing.length > 0 && <>Not in this file: {missing.join(", ")}.</>}
          </Callout>
        )}

        {unknown.length > 0 && (
          <Section title="New columns" description="Choose where each goes, or leave “Don't import”." bodyClassName="p-0">
            {unknown.map((h) => (
              <ColumnRow key={h} header={h} value="" samples={sampleFor(h)} highlight />
            ))}
          </Section>
        )}

        <details className="group rounded-xl border bg-card shadow-[var(--shadow-card)]" open={unknown.length === 0 && headers.length < 12}>
          <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold">
            Recognised columns ({known.length}) <span className="font-normal text-muted-foreground group-open:hidden">· show</span>
          </summary>
          <div className="border-t">
            {known.map((h) => (
              <ColumnRow key={h} header={h} value={presetMap[h] ?? ""} samples={sampleFor(h)} />
            ))}
          </div>
        </details>

        <Section title="How to handle differences">
          <div className="space-y-4 text-sm">
            <label className="flex items-start gap-3">
              <input type="checkbox" name="emptyMeansUnknown" defaultChecked={opts.emptyMeansUnknown ?? presetOptions.emptyMeansUnknown ?? true} className="mt-0.5 size-4" />
              <span>
                <span className="font-medium">Keep what Kinus has when a cell is empty</span>
                <span className="block text-muted-foreground">Recommended. An empty cell in the file never erases a phone number or detail already saved.</span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input type="checkbox" name="takeBunksFromFile" defaultChecked={opts.takeBunksFromFile ?? false} className="mt-0.5 size-4" />
              <span>
                <span className="font-medium">Use the file&apos;s bunks even for campers staff moved</span>
                <span className="block text-muted-foreground">Leave this off once you have moved campers between bunks in Kinus, so those moves are kept.</span>
              </span>
            </label>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Advanced</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Country for phone numbers without a + code" htmlFor="phoneDefaultRegion" hint="Two letters, e.g. US, CA, FR, IL.">
                  <Input id="phoneDefaultRegion" name="phoneDefaultRegion" defaultValue={presetOptions.phoneDefaultRegion ?? "US"} maxLength={2} className="w-24 uppercase" />
                </Field>
                <Field label="Save this column layout for next time" htmlFor="preset_name" hint="Only needed if the export format changed.">
                  <Input id="preset_name" name="preset_name" placeholder="Layout name" />
                </Field>
              </div>
            </details>
          </div>
        </Section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg">
            Review changes
          </Button>
          <span className="text-sm text-muted-foreground">Nothing is saved yet.</span>
        </div>
      </ActionForm>
    </div>
  );
}
