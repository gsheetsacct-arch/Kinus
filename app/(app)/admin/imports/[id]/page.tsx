import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Callout } from "@/components/callout";
import { Steps, IMPORT_STEPS } from "@/components/steps";
import { UndoImportButton } from "@/components/undo-import-button";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { IMPORT_STATUS } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { FieldChange, ParsedCamper, Candidate } from "@/lib/import";
import { applyImportAction, archiveMissing, cancelImport, resolveConflict } from "../actions";

export const metadata = { title: "Import" };

type Row = { id: string; row_number: number; action: string; matched_camper_id: string | null; match_method: string | null; parsed: ParsedCamper | null; changes: FieldChange[]; warnings: string[] };

const FIELD_LABEL: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  division: "Division",
  bunk: "Bunk",
  grade: "Grade",
  tshirt_size: "T-shirt",
  bunk_preferences: "Bunk preferences",
  local_address: "Address",
  local_address_cross_streets: "Cross streets",
  medical_notes: "Medical notes",
  allergies: "Allergies",
  has_allergies: "Has allergies",
  has_epipen: "EpiPen",
  has_medications: "Medications",
  notes_from_parents: "Notes from parents",
};
const fieldLabel = (f: string) => {
  const m = /^contact\[(\w+),(\d+)\](?:\.(\w+))?$/.exec(f);
  if (m) return `${m[1] === "emergency" ? `Emergency contact ${m[2]}` : m[1][0].toUpperCase() + m[1].slice(1)} ${m[3] ?? ""}`.trim();
  return FIELD_LABEL[f] ?? f;
};
const show = (v: string | null) => (v === "true" ? "Yes" : v === "false" ? "No" : v);
const notes = (r: Row) => r.warnings.filter((w) => !w.startsWith("candidates:"));

function Who({ p }: { p: ParsedCamper | null }) {
  if (!p) return <span className="text-muted-foreground">(unreadable row)</span>;
  return (
    <span className="min-w-0">
      <span className="block truncate font-medium" dir="auto">
        {p.first_name} {p.last_name}
      </span>
      <span className="block truncate text-xs text-muted-foreground" dir="auto">
        {[p.division_name, p.bunk_name].filter(Boolean).join(" · ") || "No division"}
        {p.source_id ? ` · #${p.source_id}` : ""}
      </span>
    </span>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className={`rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] ${tone === "warn" && value > 0 ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : ""}`}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const { data: imp } = await supabase.from("imports").select("*, profiles:uploaded_by(full_name)").eq("id", id).maybeSingle();
  if (!imp) notFound();
  if (imp.status === "uploaded") redirect(`/admin/imports/${id}/map`);
  const rows = (await fetchAll((from, to) =>
    supabase.from("import_rows").select("id, row_number, action, matched_camper_id, match_method, parsed, changes, warnings").eq("import_id", id).order("row_number").range(from, to),
  )) as unknown as Row[];
  const by = (a: string) => rows.filter((r) => r.action === a);
  const summary = (imp.summary ?? {}) as { missingList?: Candidate[]; newDivisions?: string[]; newBunks?: string[]; revertedAt?: string };
  const options = (imp.options ?? {}) as { partialWarning?: string[]; divisionsInFile?: string[]; lostTextOverride?: boolean; lostTextCells?: number };
  const missing = summary.missingList ?? [];
  const flagged = rows.filter((r) => notes(r).length > 0);
  const conflicts = by("conflict");
  const previewed = imp.status === "previewed";
  const { data: latest } = await supabase.from("imports").select("id").eq("session_id", imp.session_id).eq("status", "applied").order("applied_at", { ascending: false }).limit(1).maybeSingle();
  const isLatest = latest?.id === imp.id;
  const candidateCampers = conflicts.length
    ? await fetchAll((from, to) =>
        supabase.from("campers_visible").select("id, display_name, camper_code").eq("session_id", imp.session_id).is("archived_at", null).order("last_name").order("id").range(from, to),
      )
    : [];

  // "Division / Bunk" strings → { division: [bunks] }
  const newStructure = new Map<string, string[]>();
  for (const d of summary.newDivisions ?? []) newStructure.set(d, []);
  for (const pair of summary.newBunks ?? []) {
    const i = pair.indexOf(" / ");
    const div = pair.slice(0, i);
    newStructure.set(div, [...(newStructure.get(div) ?? []), pair.slice(i + 3)]);
  }
  const newBunkCount = summary.newBunks?.length ?? 0;
  // the "Updated" tab groups changes by field, most common first
  const fieldMap = new Map<string, { r: Row; c: FieldChange }[]>();
  for (const r of by("update")) for (const c of r.changes) fieldMap.set(c.field, [...(fieldMap.get(c.field) ?? []), { r, c }]);
  const byField = [...fieldMap.entries()].sort((a, b) => b[1].length - a[1].length);
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const st = IMPORT_STATUS[imp.status];
  const by_ = (imp.profiles as { full_name: string } | null)?.full_name ?? "someone";

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/imports", label: "Import roster" }}
        title={previewed ? "Review the changes" : "Import details"}
        description={
          <span className="flex flex-wrap items-center gap-2" dir="auto">
            {imp.file_name} <Badge variant={st.variant}>{st.label}</Badge>
          </span>
        }
      />
      {previewed && <Steps steps={IMPORT_STEPS} current={3} />}

      {imp.status === "applied" && (
        <Callout tone="success" title={`Applied ${formatDateTime(imp.applied_at)}`} action={isLatest ? <UndoImportButton id={imp.id} fileName={imp.file_name} /> : undefined}>
          Uploaded by {by_}. {isLatest ? "This is the latest import. You can undo it to go back to how things were before." : "A newer import was applied after this one. To undo this one, undo the newer one first."}
        </Callout>
      )}
      {imp.status === "reverted" && (
        <Callout title="This import was undone" action={<Undo2 className="size-5 text-muted-foreground" />}>
          Undone {formatDateTime(summary.revertedAt ?? null)}. Everything it changed was put back. You can upload the file again if you need to.
        </Callout>
      )}
      {imp.status === "cancelled" && <Callout>This draft was discarded. It never changed anything.</Callout>}

      {previewed && (
        <p className="text-base">
          Applying this file will <strong>add {n(by("add").length, "camper", "campers")}</strong>, <strong>update {by("update").length}</strong>
          {missing.length > 0 && (
            <>
              , and mark <strong>{missing.length}</strong> as no longer in the export
            </>
          )}
          . {by("unchanged").length > 0 && `${n(by("unchanged").length, "camper is", "campers are")} unchanged.`}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="New campers" value={by("add").length} />
        <Tile label="Updated" value={by("update").length} />
        <Tile label="No change" value={by("unchanged").length} />
        <Tile label="Not in this file" value={missing.length} tone="warn" />
        <Tile label="Need a decision" value={conflicts.length} tone="warn" />
        <Tile label="Worth a look" value={flagged.length} tone="warn" />
      </div>

      {conflicts.length > 0 && previewed && (
        <Callout tone="warning" title={`${conflicts.length} ${conflicts.length === 1 ? "row needs" : "rows need"} a decision before you can apply`}>
          Open the <strong>Need a decision</strong> tab below.
        </Callout>
      )}
      {flagged.length > 0 && (
        <Callout tone="warning" title={`${flagged.length} ${flagged.length === 1 ? "camper is" : "campers are"} worth a look`}>
          For example campers the export lists in two divisions at once. Kinus placed each one where their bunk belongs; check them in the <strong>Worth a look</strong> tab.
        </Callout>
      )}
      {options.partialWarning && options.partialWarning.length > 0 && (
        <Callout tone="warning" title="Is this the full export?">
          {options.partialWarning.join(" · ")}. Campers missing from a file are only marked, never deleted.
        </Callout>
      )}

      {newStructure.size + newBunkCount > 0 && (
        <details className="group rounded-xl border bg-card shadow-[var(--shadow-card)]">
          <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold">
            {previewed ? "Will create" : "Created"} {newStructure.size} {newStructure.size === 1 ? "division" : "divisions"} and {newBunkCount} {newBunkCount === 1 ? "bunk" : "bunks"}
            <span className="font-normal text-muted-foreground group-open:hidden"> · show</span>
          </summary>
          <div className="grid gap-3 border-t p-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...newStructure.entries()].map(([div, bunks]) => (
              <div key={div} className="rounded-lg border bg-background p-3">
                <div className="font-medium" dir="auto">
                  {div}
                  {(summary.newDivisions ?? []).includes(div) && <Badge variant="primary" className="ml-2">new</Badge>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground" dir="auto">
                  {bunks.length ? bunks.join(", ") : "No new bunks"}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <Tabs defaultValue={conflicts.length ? "conflict" : flagged.length ? "flagged" : by("update").length ? "update" : "add"}>
        <div className="-mx-4 overflow-x-auto px-4">
          <TabsList>
            <TabsTrigger value="add">New ({by("add").length})</TabsTrigger>
            <TabsTrigger value="update">Updated ({by("update").length})</TabsTrigger>
            <TabsTrigger value="conflict">Need a decision ({conflicts.length})</TabsTrigger>
            <TabsTrigger value="flagged">Worth a look ({flagged.length})</TabsTrigger>
            <TabsTrigger value="missing">Not in file ({missing.length})</TabsTrigger>
            <TabsTrigger value="unchanged">No change ({by("unchanged").length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="add">
          <Section bodyClassName="p-0">
            {by("add").length ? (
              <ul className="divide-y">
                {by("add").slice(0, 500).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <Who p={r.parsed} />
                    <span className="shrink-0 text-xs text-muted-foreground">row {r.row_number}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-5 text-sm text-muted-foreground">No new campers.</p>
            )}
            {by("add").length > 500 && <p className="border-t px-5 py-3 text-xs text-muted-foreground">Showing the first 500 of {by("add").length}.</p>}
          </Section>
        </TabsContent>

        <TabsContent value="update" className="space-y-3">
          {/* by field first ("Bunk: 700 campers"), so a big re-shuffle reads at a glance */}
          {byField.map(([field, list]) => (
            <details key={field} className="group overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
              <summary className="flex cursor-pointer select-none items-center gap-3 px-5 py-3.5 text-sm">
                <span className="font-semibold">{fieldLabel(field)}</span>
                <span className="text-muted-foreground">
                  changes for {list.length} {list.length === 1 ? "camper" : "campers"}
                </span>
                <span className="ml-auto text-xs text-primary group-open:hidden">Show</span>
              </summary>
              <div className="overflow-x-auto border-t">
                <table className="w-full min-w-[520px] table-fixed text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="w-[40%] px-5 py-2 font-medium">Camper</th>
                      <th className="w-[30%] py-2 pr-3 font-medium">Before</th>
                      <th className="w-[30%] py-2 pr-5 font-medium">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.slice(0, 300).map(({ r, c }) => (
                      <tr key={r.id} className="border-t align-top">
                        <td className="px-5 py-1.5">
                          {r.matched_camper_id ? (
                            <Link href={`/campers/${r.matched_camper_id}`} className="hover:underline" dir="auto">
                              {r.parsed ? `${r.parsed.first_name} ${r.parsed.last_name}` : `Row ${r.row_number}`}
                            </Link>
                          ) : (
                            <span dir="auto">{r.parsed ? `${r.parsed.first_name} ${r.parsed.last_name}` : `Row ${r.row_number}`}</span>
                          )}
                        </td>
                        <td className="break-words py-1.5 pr-3 text-muted-foreground line-through decoration-destructive/50" dir="auto">
                          {show(c.old) ?? <em className="no-underline">empty</em>}
                        </td>
                        <td className="break-words py-1.5 pr-5 font-medium" dir="auto">
                          {show(c.new) ?? <em className="font-normal text-muted-foreground">empty</em>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {list.length > 300 && <p className="border-t px-5 py-3 text-xs text-muted-foreground">Showing the first 300 of {list.length}.</p>}
              </div>
            </details>
          ))}
          {!by("update").length && <p className="text-sm text-muted-foreground">No existing campers change.</p>}
        </TabsContent>

        <TabsContent value="conflict" className="space-y-3">
          {conflicts.map((r) => {
            const candLine = r.warnings.find((w) => w.startsWith("candidates:"));
            const cands: Candidate[] = candLine ? JSON.parse(candLine.slice("candidates:".length)) : [];
            return (
              <Section key={r.id}>
                <Who p={r.parsed} />
                <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">{notes(r).join(" ")}</p>
                {previewed && (
                  <ActionForm action={resolveConflict} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="row_id" value={r.id} />
                    <div className="w-full max-w-sm">
                      <Select name="choice" defaultValue={cands[0]?.id ?? "skip"} aria-label="What should happen with this row">
                        {cands.map((c) => (
                          <option key={c.id} value={c.id}>
                            It&apos;s {c.display_name} ({c.division_name ?? "no division"})
                          </option>
                        ))}
                        <option value="add">It&apos;s a different camper: add them</option>
                        <option value="skip">Skip this row</option>
                        {(candidateCampers ?? []).length > 0 && (
                          <optgroup label="It's someone else already in Kinus">
                            {(candidateCampers ?? []).map((c) => (
                              <option key={c.id} value={c.id ?? ""}>
                                {c.display_name} · {c.camper_code}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </Select>
                    </div>
                    <Button size="sm" type="submit">
                      Save decision
                    </Button>
                  </ActionForm>
                )}
              </Section>
            );
          })}
          {!conflicts.length && <p className="text-sm text-muted-foreground">Nothing needs a decision.</p>}
        </TabsContent>

        <TabsContent value="flagged">
          <Section bodyClassName="p-0">
            {flagged.length ? (
              <ul className="divide-y">
                {flagged.map((r) => (
                  <li key={r.id} className="space-y-1 px-5 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <Who p={r.parsed} />
                      {r.matched_camper_id && (
                        <Link href={`/campers/${r.matched_camper_id}`} className="shrink-0 text-xs text-primary hover:underline">
                          Open camper
                        </Link>
                      )}
                    </div>
                    <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-800 dark:text-amber-200">
                      {notes(r).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-5 text-sm text-muted-foreground">Nothing unusual in this file.</p>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="missing">
          {missing.length ? (
            <Section description={`These campers are in ${options.divisionsInFile?.join(", ")} in Kinus but not in this file. ${imp.status === "applied" ? "They are marked “not in the latest export”." : "When you apply, they get marked; nothing is deleted."} Archive anyone who has left the program.`}>
              <ActionForm action={archiveMissing} className="space-y-3" confirm="Archive the selected campers?" confirmDetail="They disappear from lists and check-in. Their history is kept, and you can restore them from their page." confirmLabel="Archive" danger>
                <ul className="divide-y rounded-lg border">
                  {missing.map((m) => (
                    <li key={m.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40">
                        <input type="checkbox" name="camper_id" value={m.id} className="size-4" />
                        <span className="flex-1" dir="auto">
                          {m.display_name}
                        </span>
                        <span className="text-xs text-muted-foreground" dir="auto">
                          {m.division_name}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <Button variant="outline" size="sm" type="submit">
                  Archive selected
                </Button>
              </ActionForm>
            </Section>
          ) : (
            <p className="text-sm text-muted-foreground">Everyone in these divisions is in the file.</p>
          )}
        </TabsContent>

        <TabsContent value="unchanged">
          <Section bodyClassName="p-0">
            <ul className="divide-y">
              {by("unchanged").slice(0, 500).map((r) => (
                <li key={r.id} className="px-5 py-2.5 text-sm">
                  <Who p={r.parsed} />
                </li>
              ))}
            </ul>
            {!by("unchanged").length && <p className="p-5 text-sm text-muted-foreground">None.</p>}
          </Section>
        </TabsContent>
      </Tabs>

      {previewed && (
        <div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 p-4 shadow-lg backdrop-blur md:bottom-4">
          <span className="text-sm text-muted-foreground">{conflicts.length ? "Resolve the rows that need a decision first." : "Nothing has been saved yet."}</span>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="ghost">
              <Link href={`/admin/imports/${id}/map`}>Back to columns</Link>
            </Button>
            <ActionForm action={cancelImport} confirm="Discard this draft?" confirmDetail="Nothing has been changed yet; the file is just set aside." confirmLabel="Discard" danger>
              <input type="hidden" name="id" value={id} />
              <Button variant="outline" type="submit">
                Discard
              </Button>
            </ActionForm>
            <ActionForm action={applyImportAction} confirm="Apply this import now?" confirmDetail={`${n(by("add").length, "camper", "campers")} will be added and ${by("update").length} updated. You can undo it afterwards.`} confirmLabel="Apply">
              <input type="hidden" name="id" value={id} />
              <Button type="submit" disabled={conflicts.length > 0}>
                <CheckCircle2 /> Apply import
              </Button>
            </ActionForm>
          </div>
        </div>
      )}
    </div>
  );
}
