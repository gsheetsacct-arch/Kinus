import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { TARGET_OPTIONS, type ColumnMap, type MappingOptions } from "@/lib/import";
import { previewImport } from "../../actions";

export default async function MapPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const { data: imp } = await supabase.from("imports").select("id, file_name, status, mapping_id, options").eq("id", id).maybeSingle();
  if (!imp) notFound();
  if (imp.status === "applied" || imp.status === "cancelled") redirect(`/admin/imports/${id}`);
  const opts = imp.options as { headers?: string[]; columnMap?: ColumnMap; mappingOptions?: MappingOptions; takeBunksFromFile?: boolean; emptyMeansUnknown?: boolean };
  const headers = opts.headers ?? [];
  let presetMap: ColumnMap = opts.columnMap ?? {};
  let presetOptions: MappingOptions = opts.mappingOptions ?? {};
  if (!opts.columnMap && imp.mapping_id) {
    const { data: m } = await supabase.from("import_mappings").select("column_map, options").eq("id", imp.mapping_id).maybeSingle();
    presetMap = (m?.column_map as ColumnMap) ?? {};
    presetOptions = (m?.options as MappingOptions) ?? {};
  }
  const { data: sample } = await supabase.from("import_rows").select("raw").eq("import_id", id).order("row_number").limit(3);
  const samples = (sample ?? []).map((r) => r.raw as Record<string, string>);
  const { count } = await supabase.from("import_rows").select("id", { count: "exact", head: true }).eq("import_id", id);
  const unknown = headers.filter((h) => !(h in presetMap));
  const missingFromFile = Object.keys(presetMap).filter((h) => !headers.includes(h));

  return (
    <div>
      <PageHeader title="2 · Map columns" description={`${imp.file_name} · ${count ?? 0} rows`} />
      <ActionForm action={previewImport} className="space-y-6">
        <input type="hidden" name="id" value={imp.id} />
        {(unknown.length > 0 || missingFromFile.length > 0) && (
          <Card className="border-amber-400/60">
            <CardContent className="space-y-1 pt-5 text-sm">
              {unknown.length > 0 && (
                <p>
                  <strong>{unknown.length} column(s) the preset has not seen:</strong> {unknown.join(", ")}. They stay in the raw data unless you map them.
                </p>
              )}
              {missingFromFile.length > 0 && (
                <p>
                  <strong>Expected but not in this file:</strong> {missingFromFile.join(", ")}.
                </p>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Columns</CardTitle>
            <CardDescription>Export header → Kinus field. Several columns may map to &quot;bunk&quot;; the first non-empty one wins (Hebrew, French, then general).</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-3">Export column</th>
                  <th className="py-1 pr-3">Sample</th>
                  <th className="py-1">Kinus field</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h) => (
                  <tr key={h} className={`border-t ${!(h in presetMap) ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}>
                    <td className="py-1.5 pr-3 font-mono text-xs">{h}</td>
                    <td className="max-w-48 truncate py-1.5 pr-3 text-xs text-muted-foreground" dir="auto">
                      {samples.map((s) => s[h]).filter(Boolean).slice(0, 2).join(" · ")}
                    </td>
                    <td className="py-1.5">
                      <Select name={`map:${h}`} defaultValue={presetMap[h] ?? ""} className="h-8 text-xs">
                        {TARGET_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="emptyMeansUnknown" defaultChecked={opts.emptyMeansUnknown ?? presetOptions.emptyMeansUnknown ?? true} className="mt-0.5 size-4" />
              <span>
                <strong>Empty cells mean unknown.</strong> An empty cell never clears a value Kinus already has. Untick to make the file authoritative (empties clear).
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="takeBunksFromFile" defaultChecked={opts.takeBunksFromFile ?? false} className="mt-0.5 size-4" />
              <span>
                <strong>Take bunks from the file</strong> even where staff moved a camper in Kinus. Leave off once bunks have been edited here.
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="phoneDefaultRegion">Default country for phone numbers without +code</Label>
                <Input id="phoneDefaultRegion" name="phoneDefaultRegion" defaultValue={presetOptions.phoneDefaultRegion ?? "US"} maxLength={2} className="uppercase" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="preset_name">Save this mapping as a new preset (optional)</Label>
                <Input id="preset_name" name="preset_name" placeholder="e.g. Export 2027" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Button type="submit" size="lg">
          Preview changes
        </Button>
      </ActionForm>
    </div>
  );
}
