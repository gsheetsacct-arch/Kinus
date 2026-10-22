import Link from "next/link";
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
import { guessTarget, TARGET_OPTIONS, type ColumnMap, type MappingOptions } from "@/lib/import";
import { columnKey, humanLabel, parseExtraFields } from "@/lib/import/extra-fields";
import { FIELD_BY_KEY } from "@/lib/fields";
import { previewImport } from "../../actions";

export const metadata = { title: "Match the columns" };

const EXTRA = "__extra";
/** Kinus fields in plain words ("tshirt_size" → "T-shirt", "contact[mother].phone" → "Mother: phone"). */
const targetLabel = (value: string, raw: string) => {
  if (FIELD_BY_KEY[value]) return FIELD_BY_KEY[value].label;
  const known: Record<string, string> = { division: "Division", bunk: "Bunk", source_id: "Registration ID" };
  if (known[value]) return known[value];
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

function ColumnRow({ header, value, samples, highlight, labels, name }: { header: string; value: string; samples: string[]; highlight?: boolean; labels?: string[]; name?: string }) {
  return (
    <div className={`grid gap-2 border-b px-4 py-3 last:border-0 sm:grid-cols-[1fr_1fr_260px] sm:items-center ${highlight ? "bg-amber-50/70 dark:bg-amber-950/20" : ""}`}>
      <div className="min-w-0 space-y-1">
        <div className="truncate font-mono text-xs">{header}</div>
        {labels && labels.length > 0 && <div className="text-xs text-primary">Labels use it: {labels.join(", ")}</div>}
        {name !== undefined && (
          <label className="block">
            <span className="sr-only">Name in Kinus for {header}</span>
            <Input name={`name:${header}`} defaultValue={name} placeholder="Name in Kinus" dir="auto" className="h-8 text-sm" title="What this column is called on the camper page, in lists and labels" />
          </label>
        )}
      </div>
      <div className="min-w-0 truncate text-xs text-muted-foreground" dir="auto">
        {samples.length ? samples.join(" · ") : <em>empty in the first rows</em>}
      </div>
      <Select name={`map:${header}`} defaultValue={value} className="h-9 text-sm" aria-label={`What to do with ${header}`}>
        <option value="">Not needed</option>
        <option value={EXTRA}>Show on the camper page</option>
        <optgroup label="A Kinus field">
          {TARGET_OPTIONS.filter((o) => o.value !== "").map((o) => (
            <option key={o.value} value={o.value}>
              {targetLabel(o.value, o.label)}
            </option>
          ))}
        </optgroup>
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
  const opts = imp.options as { headers?: string[]; columnMap?: ColumnMap; mappingOptions?: MappingOptions; takeBunksFromFile?: boolean; emptyMeansUnknown?: boolean; fixedDivision?: string | null };
  const headers = opts.headers ?? [];
  let presetMap: ColumnMap = opts.columnMap ?? {};
  let presetOptions: MappingOptions = opts.mappingOptions ?? {};
  if (!opts.columnMap && imp.mapping_id) {
    const { data: m } = await supabase.from("import_mappings").select("column_map, options").eq("id", imp.mapping_id).maybeSingle();
    presetMap = (m?.column_map as ColumnMap) ?? {};
    presetOptions = (m?.options as MappingOptions) ?? {};
  }
  // a kind of export Kinus hasn't seen: guess the usual columns (first name, last name, id…)
  if (!opts.columnMap && !imp.mapping_id) {
    const taken = new Set<string>();
    for (const h of headers) {
      const t = guessTarget(h);
      if (t && !taken.has(t)) {
        presetMap[h] = t;
        taken.add(t);
      }
    }
  }
  // which export this is: the main one (divisions from the file), or a separate program's
  const [{ data: divisionRows }, { data: campRows }, { data: layoutRow }] = await Promise.all([
    supabase.from("divisions").select("name, group_id, sort_order, session_id, sessions!inner(is_active)").eq("sessions.is_active", true).order("sort_order").order("name"),
    supabase.from("division_groups").select("id, name, sort_order, sessions!inner(is_active)").eq("sessions.is_active", true).order("sort_order"),
    imp.mapping_id ? supabase.from("import_mappings").select("name").eq("id", imp.mapping_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const campOf = (g: string | null) => (campRows ?? []).find((c) => c.id === (g ?? campRows?.[0]?.id))?.name ?? null;
  const program = opts.fixedDivision !== undefined ? (opts.fixedDivision ?? "") : (presetOptions.fixedDivision ?? "");
  const { data: sample } = await supabase.from("import_rows").select("raw").eq("import_id", id).order("row_number").limit(25);
  const samples = (sample ?? []).map((r) => r.raw as Record<string, string>);
  const sampleFor = (h: string) => [...new Set(samples.map((s) => s[h]).filter(Boolean))].slice(0, 2);
  const { count } = await supabase.from("import_rows").select("id", { count: "exact", head: true }).eq("import_id", id);
  // extra fields already chosen, and the columns labels read ("{{source.ppa.yarmulka_size}}")
  const [{ data: extraRow }, { data: mergeFields }] = await Promise.all([
    supabase.from("settings").select("value").eq("key", "extra_fields").maybeSingle(),
    supabase.from("merge_fields").select("label, source_field"),
  ]);
  const extras = parseExtraFields(extraRow?.value);
  const isExtra = (h: string) => extras.some((f) => columnKey(f.column) === columnKey(h));
  const labelsUsing = (h: string) => (mergeFields ?? []).filter((f) => [...f.source_field.matchAll(/source\.([^{}|\s]+)/g)].some((m) => columnKey(m[1]) === columnKey(h))).map((f) => f.label);
  // a column labels read is shown on the camper page too, so it plainly is in use
  const valueFor = (h: string) => presetMap[h] ?? (isExtra(h) || labelsUsing(h).length ? EXTRA : "");
  // the plain name shown for an extra field ("Sleeping at the Kinus"), editable right here
  const nameFor = (h: string) => extras.find((f) => columnKey(f.column) === columnKey(h))?.label ?? humanLabel(h);
  const decided = (h: string) => h in presetMap || isExtra(h) || labelsUsing(h).length > 0;
  const known = headers.filter(decided);
  const shown = known.filter((h) => valueFor(h) === EXTRA);
  const rest = known.filter((h) => valueFor(h) !== EXTRA);
  const unknown = headers.filter((h) => !decided(h));
  const missing = Object.keys(presetMap).filter((h) => !headers.includes(h));
  const lost = { cells: (imp.options as { lostTextCells?: number }).lostTextCells ?? 0, sample: ((imp.options as { lostTextSample?: { row: number; column: string; value: string }[] }).lostTextSample ?? []) };

  return (
    <div className="max-w-4xl">
      <PageHeader back={{ href: "/admin/imports", label: "Import roster" }} title="Match the columns" description={<span dir="auto">{imp.file_name} · {count ?? 0} campers in the file</span>} />
      <Steps steps={IMPORT_STEPS} current={2} />
      <ActionForm action={previewImport} className="space-y-6">
        <input type="hidden" name="id" value={imp.id} />
        <Section
          title="Which export is this?"
          description={layoutRow?.name ? `The columns are set up as for your last “${layoutRow.name}” file.` : "A kind of export Kinus hasn't seen: its column setup is remembered for next time."}
        >
          <div className="space-y-2 text-sm">
            <Select name="fixedDivision" defaultValue={program} aria-label="Which export this is">
              <option value="">The main export: each camper&apos;s division comes from the file</option>
              {(divisionRows ?? []).map((d) => (
                <option key={d.name} value={d.name}>
                  A separate program: everyone goes into {d.name}
                  {campOf(d.group_id) && campOf(d.group_id)!.toLowerCase() !== d.name.toLowerCase() ? ` (${campOf(d.group_id)})` : ""}
                </option>
              ))}
            </Select>
            <p className="text-muted-foreground">
              For a program with its own export and no division column (the virtual program): make its camp and division in{" "}
              <Link href="/admin/divisions" className="text-primary hover:underline">
                Divisions &amp; bunks
              </Link>{" "}
              first, then choose it here. Its campers are kept apart: this file only updates them, and the main export leaves them alone.
            </p>
          </div>
        </Section>
        {lost.cells > 0 && (
          <Callout tone="warning" title={`${lost.cells} ${lost.cells === 1 ? "name has" : "names have"} “???” instead of letters`}>
            <span className="block">
              For example {lost.sample.slice(0, 3).map((x) => `“${x.value}” (row ${x.row})`).join(", ")}. This happens when the export is opened and saved again in Excel or WPS: Hebrew and French
              letters turn into “???”.
            </span>
            <span className="mt-1 block">
              Best: download the export again and upload it without opening it first.{" "}
              <Link href="/admin/imports/new" className="font-medium underline">
                Upload another file
              </Link>
              . If those names really are written that way, just carry on.
            </span>
          </Callout>
        )}
        {unknown.length === 0 && missing.length === 0 ? (
          <Callout tone="success" title={`All ${headers.length} columns were recognised`}>
            Nothing to do here unless the export changed. Press <strong>Review changes</strong>.
          </Callout>
        ) : (
          <Callout tone="warning" title={`${known.length} of ${headers.length} columns were recognised`}>
            {unknown.length > 0 && <>The file has {unknown.length} new {unknown.length === 1 ? "column" : "columns"}, highlighted below. Choose whether to show each on the camper page. </>}
            {missing.length > 0 && <>Not in this file: {missing.join(", ")}.</>}
          </Callout>
        )}

        {unknown.length > 0 && (
          <Section
            title="New columns"
            description="Give each column you want a plain name (“Sleeping at the Kinus”), then choose “Show on the camper page”: lists and labels can use it too. “Not needed” keeps it out of sight. Either way nothing is lost: every column is kept with each camper, and you can change this on the next import."
            bodyClassName="p-0"
          >
            {unknown.map((h) => (
              <ColumnRow key={h} header={h} value="" samples={sampleFor(h)} highlight labels={labelsUsing(h)} name={nameFor(h)} />
            ))}
          </Section>
        )}

        {shown.length > 0 && (
          <Section title="Shown on the camper page" description="The name each column goes by in Kinus: on the camper page, in lists and on labels. Change it here any time." bodyClassName="p-0">
            {shown.map((h) => (
              <ColumnRow key={h} header={h} value={EXTRA} samples={sampleFor(h)} labels={labelsUsing(h)} name={nameFor(h)} />
            ))}
          </Section>
        )}

        <details className="group rounded-xl border bg-card shadow-[var(--shadow-card)]" open={unknown.length === 0 && headers.length < 12}>
          <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold">
            Other recognised columns ({rest.length}) <span className="font-normal text-muted-foreground group-open:hidden">· show</span>
          </summary>
          <div className="border-t">
            {rest.map((h) => (
              <ColumnRow key={h} header={h} value={valueFor(h)} samples={sampleFor(h)} labels={labelsUsing(h)} name={h in presetMap ? undefined : nameFor(h)} />
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
