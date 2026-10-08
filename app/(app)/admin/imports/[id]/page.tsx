import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { formatDateTime } from "@/lib/utils";
import type { FieldChange, ParsedCamper, Candidate } from "@/lib/import";
import { applyImportAction, archiveMissing, cancelImport, resolveConflict } from "../actions";

type Row = {
  id: string;
  row_number: number;
  action: string;
  matched_camper_id: string | null;
  match_method: string | null;
  parsed: ParsedCamper | null;
  changes: FieldChange[];
  warnings: string[];
  applied: boolean;
};

function Name({ p }: { p: ParsedCamper | null }) {
  if (!p) return <span className="text-muted-foreground">(unparsed)</span>;
  return (
    <span dir="auto" className="font-medium">
      {p.first_name} {p.last_name}
      <span className="ml-2 text-xs font-normal text-muted-foreground" dir="auto">
        {[p.division_name, p.bunk_name].filter(Boolean).join(" · ")}
        {p.source_id ? ` · #${p.source_id}` : ""}
      </span>
    </span>
  );
}

function Changes({ changes }: { changes: FieldChange[] }) {
  if (!changes.length) return null;
  return (
    <table className="mt-1 w-full max-w-2xl text-xs">
      <tbody>
        {changes.map((c, i) => (
          <tr key={i} className="border-t border-dashed">
            <td className="w-48 py-0.5 pr-2 font-mono text-muted-foreground">{c.field}</td>
            <td className="py-0.5 pr-2 line-through decoration-destructive/60" dir="auto">
              {c.old ?? <em className="text-muted-foreground no-underline">empty</em>}
            </td>
            <td className="py-0.5 font-medium" dir="auto">
              {c.new ?? <em className="text-muted-foreground">empty</em>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const { data: imp } = await supabase.from("imports").select("*, profiles:uploaded_by(full_name)").eq("id", id).maybeSingle();
  if (!imp) notFound();
  if (imp.status === "uploaded") redirect(`/admin/imports/${id}/map`);
  const { data: rowsRaw } = await supabase.from("import_rows").select("id, row_number, action, matched_camper_id, match_method, parsed, changes, warnings, applied").eq("import_id", id).order("row_number");
  const rows = (rowsRaw ?? []) as unknown as Row[];
  const by = (a: string) => rows.filter((r) => r.action === a);
  const summary = (imp.summary ?? {}) as { missingList?: Candidate[]; newDivisions?: string[]; newBunks?: string[] };
  const options = (imp.options as { partialWarning?: string[]; divisionsInFile?: string[]; lostTextOverride?: boolean; lostTextCells?: number; encoding?: string }) ?? {};
  const missing = summary.missingList ?? [];
  const warnings = rows.filter((r) => r.warnings.some((w) => !w.startsWith("candidates:")));
  const previewed = imp.status === "previewed";
  const conflicts = by("conflict");
  const { data: candidateCampers } = conflicts.length
    ? await supabase.from("campers_visible").select("id, display_name, camper_code, division_id").eq("session_id", imp.session_id).is("archived_at", null).order("last_name")
    : { data: [] };

  return (
    <div>
      <PageHeader
        title={previewed ? "3 · Review and apply" : `Import · ${imp.status}`}
        description={`${imp.file_name} · uploaded ${formatDateTime(imp.uploaded_at)} by ${(imp.profiles as { full_name: string } | null)?.full_name ?? "?"}${imp.applied_at ? ` · applied ${formatDateTime(imp.applied_at)}` : ""}${options.encoding ? ` · ${options.encoding}` : ""}`}
        actions={
          previewed ? (
            <>
              <Button asChild variant="outline">
                <Link href={`/admin/imports/${id}/map`}>Back to mapping</Link>
              </Button>
              <ActionForm action={cancelImport}>
                <input type="hidden" name="id" value={id} />
                <Button variant="ghost" type="submit">
                  Cancel import
                </Button>
              </ActionForm>
              <ActionForm action={applyImportAction} confirm={`Apply ${by("add").length} additions and ${by("update").length} updates?`}>
                <input type="hidden" name="id" value={id} />
                <Button type="submit" size="lg" disabled={conflicts.length > 0}>
                  Apply import
                </Button>
              </ActionForm>
            </>
          ) : undefined
        }
      />
      {conflicts.length > 0 && previewed && (
        <Alert variant="warning" className="mb-4">
          <AlertTitle>{conflicts.length} conflict(s) to resolve before applying</AlertTitle>
          <AlertDescription>See the Conflicts tab.</AlertDescription>
        </Alert>
      )}
      {options.partialWarning && options.partialWarning.length > 0 && (
        <Alert variant="warning" className="mb-4">
          <AlertTitle>Is this a partial export?</AlertTitle>
          <AlertDescription>{options.partialWarning.join(" · ")}. Campers not in the file are only flagged, never removed.</AlertDescription>
        </Alert>
      )}
      {options.lostTextOverride && (options.lostTextCells ?? 0) > 0 && (
        <Alert variant="warning" className="mb-4">
          <AlertDescription>This file contained {options.lostTextCells} cells of &quot;??&quot; text and was imported with the override.</AlertDescription>
        </Alert>
      )}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Added", by("add").length],
          ["Changed", by("update").length],
          ["Unchanged", by("unchanged").length],
          ["Conflicts", conflicts.length],
          ["Skipped", by("skip").length],
          ["Not in file", missing.length],
        ].map(([label, n]) => (
          <Card key={label as string}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-2xl font-semibold">{n}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {((summary.newDivisions?.length ?? 0) > 0 || (summary.newBunks?.length ?? 0) > 0) && (
        <p className="mb-4 text-sm">
          {summary.newDivisions?.length ? (
            <>
              New divisions: {summary.newDivisions.map((d) => <Badge key={d} variant="outline" className="mr-1">{d}</Badge>)}
            </>
          ) : null}{" "}
          {summary.newBunks?.length ? (
            <>
              New bunks: {summary.newBunks.map((d) => <Badge key={d} variant="outline" className="mr-1">{d}</Badge>)}
            </>
          ) : null}
        </p>
      )}
      <Tabs defaultValue={conflicts.length ? "conflict" : by("update").length ? "update" : "add"}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="update">Changed ({by("update").length})</TabsTrigger>
          <TabsTrigger value="add">Added ({by("add").length})</TabsTrigger>
          <TabsTrigger value="conflict">Conflicts ({conflicts.length})</TabsTrigger>
          <TabsTrigger value="missing">Not in file ({missing.length})</TabsTrigger>
          <TabsTrigger value="warnings">Warnings ({warnings.length})</TabsTrigger>
          <TabsTrigger value="unchanged">Unchanged ({by("unchanged").length})</TabsTrigger>
        </TabsList>
        <TabsContent value="update" className="space-y-3">
          {by("update").map((r) => (
            <div key={r.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Name p={r.parsed} />
                <span className="text-xs text-muted-foreground">row {r.row_number} · matched by {r.match_method}</span>
              </div>
              <Changes changes={r.changes} />
            </div>
          ))}
          {!by("update").length && <p className="text-sm text-muted-foreground">No changes to existing campers.</p>}
        </TabsContent>
        <TabsContent value="add" className="space-y-1">
          {by("add").map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <Name p={r.parsed} />
              <span className="text-xs text-muted-foreground">row {r.row_number}</span>
            </div>
          ))}
          {!by("add").length && <p className="text-sm text-muted-foreground">No new campers.</p>}
        </TabsContent>
        <TabsContent value="conflict" className="space-y-3">
          {conflicts.map((r) => {
            const candLine = r.warnings.find((w) => w.startsWith("candidates:"));
            const cands: Candidate[] = candLine ? JSON.parse(candLine.slice("candidates:".length)) : [];
            return (
              <div key={r.id} className="rounded-md border p-3">
                <Name p={r.parsed} />
                <p className="mt-1 text-xs text-muted-foreground">{r.warnings.filter((w) => !w.startsWith("candidates:")).join("; ")}</p>
                {previewed && (
                  <ActionForm action={resolveConflict} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="row_id" value={r.id} />
                    <Select name="choice" className="h-9 w-72 text-sm" defaultValue={cands[0]?.id ?? "skip"}>
                      {cands.map((c) => (
                        <option key={c.id} value={c.id}>
                          Update existing: {c.display_name} ({c.division_name ?? "?"})
                        </option>
                      ))}
                      <optgroup label="Any camper">
                        {(candidateCampers ?? []).map((c) => (
                          <option key={c.id} value={c.id ?? ""}>
                            {c.display_name} · {c.camper_code}
                          </option>
                        ))}
                      </optgroup>
                      <option value="add">Create as a new camper</option>
                      <option value="skip">Skip this row</option>
                    </Select>
                    <Button size="sm" type="submit">
                      Resolve
                    </Button>
                  </ActionForm>
                )}
              </div>
            );
          })}
          {!conflicts.length && <p className="text-sm text-muted-foreground">No conflicts.</p>}
        </TabsContent>
        <TabsContent value="missing">
          {missing.length ? (
            <ActionForm action={archiveMissing} className="space-y-2" confirm="Archive the selected campers? They disappear from lists but keep their history.">
              <p className="text-sm text-muted-foreground">
                In the file&apos;s divisions ({options.divisionsInFile?.join(", ")}) but not in this file. {imp.status === "applied" ? "They are flagged “not in latest export”." : "On apply they get flagged; nothing is deleted."}
              </p>
              {missing.map((m) => (
                <label key={m.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <input type="checkbox" name="camper_id" value={m.id} className="size-4" />
                  <Link href={`/campers/${m.id}`} className="hover:underline" dir="auto">
                    {m.display_name}
                  </Link>
                  <span className="text-xs text-muted-foreground" dir="auto">
                    {m.division_name}
                  </span>
                </label>
              ))}
              <Button variant="outline" size="sm" type="submit">
                Archive selected
              </Button>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">Everyone in these divisions is in the file.</p>
          )}
        </TabsContent>
        <TabsContent value="warnings" className="space-y-1">
          {warnings.map((r) => (
            <div key={r.id} className="rounded-md border px-3 py-2 text-sm">
              <Name p={r.parsed} />
              <ul className="mt-1 list-inside list-disc text-xs text-amber-800 dark:text-amber-200">
                {r.warnings.filter((w) => !w.startsWith("candidates:")).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ))}
          {!warnings.length && <p className="text-sm text-muted-foreground">No warnings.</p>}
        </TabsContent>
        <TabsContent value="unchanged" className="space-y-1">
          {by("unchanged").map((r) => (
            <div key={r.id} className="rounded-md border px-3 py-1.5 text-sm">
              <Name p={r.parsed} />
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
