"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/section";
import { Callout } from "@/components/callout";
import { Steps } from "@/components/steps";
import { STAFF_ROLES } from "@/lib/labels";
import type { StaffRole } from "@/lib/auth/permissions";
import type { ActionResult } from "@/lib/actions/result";
import type { BulkPreview, BulkResult } from "../actions";

type Props = {
  roles: StaffRole[];
  preview: (fd: FormData) => Promise<ActionResult & { preview?: BulkPreview }>;
  apply: (rowsJson: string, mode: "invite" | "password") => Promise<ActionResult & { results?: BulkResult[] }>;
  example: string;
};

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function BulkAdd({ roles, preview, apply, example }: Props) {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [pending, start] = React.useTransition();
  const [rows, setRows] = React.useState<BulkPreview["rows"]>([]);
  const [results, setResults] = React.useState<BulkResult[]>([]);
  const [mode, setMode] = React.useState<"invite" | "password">("invite");
  const good = rows.filter((r) => !r.errors.length);
  const bad = rows.filter((r) => r.errors.length);

  const downloadPasswords = () => {
    const lines = ["Name,Email,Starting password", ...results.filter((r) => r.password).map((r) => [r.name, r.email, r.password!].map(csvCell).join(","))];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kinus-staff-passwords.csv";
    a.click();
  };

  return (
    <div className="space-y-6">
      <Steps steps={["Paste the list", "Check it", "Done"]} current={step} />
      {step === 1 && (
        <Section>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              start(async () => {
                const r = await preview(fd);
                if (!r.ok) return void toast.error(r.error);
                setRows(r.preview!.rows);
                setStep(2);
              });
            }}
          >
            <Field
              label="Paste from your spreadsheet"
              htmlFor="text"
              hint={
                <>
                  Copy the rows straight from Excel or Google Sheets. Columns: <strong>Name, Email, Role, Division or group, Bunk</strong> (a header row is fine, in any order). Role, division and bunk can be left
                  empty where they don&apos;t apply. Write <em>All</em> for all of camp.
                </>
              }
            >
              <Textarea id="text" name="text" rows={10} placeholder={example} className="font-mono text-xs" dir="auto" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="…or upload a file instead" htmlFor="file" hint=".csv or .xlsx">
                <input id="file" name="file" type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-card file:px-3 file:py-1.5" />
              </Field>
              <Field label="Role for rows that don't say" htmlFor="default_role">
                <Select id="default_role" name="default_role" defaultValue="counselor">
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {STAFF_ROLES[r].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Checking…" : "Check the list"}
            </Button>
          </form>
        </Section>
      )}

      {step === 2 && (
        <>
          {bad.length > 0 ? (
            <Callout tone="warning" title={`${bad.length} ${bad.length === 1 ? "row needs" : "rows need"} fixing`}>
              Fix them in your spreadsheet and paste again, or go ahead with the {good.length} that are fine. Rows with problems are skipped.
            </Callout>
          ) : (
            <Callout tone="success" title={`All ${rows.length} rows look good`} />
          )}
          <Section bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Row</th>
                    <th className="px-4 py-2">Person</th>
                    <th className="px-4 py-2">Role</th>
                    <th className="px-4 py-2">Where</th>
                    <th className="px-4 py-2">What happens</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className={`border-t align-top ${r.errors.length ? "bg-amber-50/70 dark:bg-amber-950/20" : ""}`}>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{r.line}</td>
                      <td className="px-4 py-2">
                        <div className="font-medium" dir="auto">
                          {r.name || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">{r.email || "—"}</div>
                      </td>
                      <td className="px-4 py-2">{r.role ? STAFF_ROLES[r.role].label : "—"}</td>
                      <td className="px-4 py-2" dir="auto">
                        {r.areaText}
                      </td>
                      <td className="px-4 py-2">
                        {r.errors.length ? (
                          <ul className="space-y-0.5 text-xs text-amber-800 dark:text-amber-200">
                            {r.errors.map((e, i) => (
                              <li key={i} className="flex gap-1">
                                <AlertCircle className="mt-0.5 size-3 shrink-0" />
                                {e}
                              </li>
                            ))}
                          </ul>
                        ) : r.existingId ? (
                          <Badge variant="outline">Already has an account · will update</Badge>
                        ) : (
                          <Badge variant="success">New</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="How should new people sign in?">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { v: "invite" as const, label: "Email them an invitation", desc: "They click the link and choose their own password. Recommended." },
                { v: "password" as const, label: "Give them a starting password", desc: "No email is sent. You download a list of passwords to hand out." },
              ].map((o) => (
                <label key={o.v} className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-sm ${mode === o.v ? "border-primary bg-primary-soft/50 ring-1 ring-primary" : ""}`}>
                  <input type="radio" checked={mode === o.v} onChange={() => setMode(o.v)} className="mt-0.5 size-4 accent-[var(--primary)]" />
                  <span>
                    <span className="block font-medium">{o.label}</span>
                    <span className="block text-xs text-muted-foreground">{o.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </Section>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <RefreshCw /> Paste again
            </Button>
            <Button
              size="lg"
              disabled={pending || good.length === 0}
              onClick={() =>
                start(async () => {
                  const r = await apply(JSON.stringify(good), mode);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(r.message);
                  setResults(r.results ?? []);
                  setStep(3);
                })
              }
            >
              {pending ? "Adding…" : `Add ${good.length} ${good.length === 1 ? "person" : "people"}`}
            </Button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          {results.some((r) => r.password) && (
            <Callout
              tone="warning"
              title="Download the starting passwords now"
              action={
                <Button size="sm" onClick={downloadPasswords}>
                  <Download /> Download list
                </Button>
              }
            >
              They are shown only once. Hand them out privately; everyone can change theirs under Your account.
            </Callout>
          )}
          <Section bodyClassName="p-0">
            <ul className="divide-y">
              {results.map((r) => (
                <li key={r.line} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  {r.outcome === "failed" ? <AlertCircle className="size-4 text-destructive" /> : <CheckCircle2 className="size-4 text-status-present" />}
                  <span className="min-w-0 flex-1">
                    <span className="font-medium" dir="auto">
                      {r.name}
                    </span>{" "}
                    <span className="text-muted-foreground">{r.email}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.outcome === "invited" && "Invitation sent"}
                    {r.outcome === "created" && <>Starting password: <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{r.password}</code></>}
                    {r.outcome === "updated" && "Updated"}
                    {r.outcome === "failed" && <span className="text-destructive">{r.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/admin/users">Back to staff</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setRows([]);
                setResults([]);
                setStep(1);
              }}
            >
              Add more
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
