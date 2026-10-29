"use client";
import * as React from "react";
import { Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Section } from "@/components/section";
import { STAFF_ROLES } from "@/lib/labels";
import { normalizeName } from "@/lib/import/normalize";
import type { StaffRole } from "@/lib/auth/permissions";

type Person = { id: string; name: string; role: string; title: string | null; divisionIds: string[] };
type Template = { id: string; name: string; copies: number; sheet: boolean };
const NONE = "none";

/** Pick a staff template and who (by division, role, name, or ticking), then print them. */
export function StaffTags({ templates, people, divisions }: { templates: Template[]; people: Person[]; divisions: { id: string; name: string; color: string | null }[] }) {
  const [templateId, setTemplateId] = React.useState(templates[0]?.id ?? "");
  const template = templates.find((t) => t.id === templateId);
  const [copies, setCopies] = React.useState(template?.copies ?? 1);
  const [single, setSingle] = React.useState(false);
  const [division, setDivision] = React.useState("");
  const [role, setRole] = React.useState("");
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set(people.map((p) => p.id)));
  const roles = [...new Set(people.map((p) => p.role))];
  const needle = normalizeName(q);
  const shown = people.filter(
    (p) =>
      (!division || (division === NONE ? !p.divisionIds.length : p.divisionIds.includes(division))) &&
      (!role || p.role === role) &&
      (!needle || normalizeName(`${p.name} ${p.title ?? ""}`).includes(needle)),
  );
  const chosen = shown.filter((p) => picked.has(p.id));
  const allOn = shown.length > 0 && chosen.length === shown.length;
  const setAll = (on: boolean) =>
    setPicked((cur) => {
      const next = new Set(cur);
      for (const p of shown) {
        if (on) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  const roleLabel = (r: string) => STAFF_ROLES[r as StaffRole]?.label ?? r;
  const divisionName = new Map(divisions.map((d) => [d.id, d.name]));

  return (
    // the page opens in a new tab and prints itself once every name has been fitted
    <form method="post" action="/print/staff/sheet" target="_blank" className="space-y-4">
      <Section>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <Field label="Template" htmlFor="template">
            <Select
              id="template"
              name="template"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setCopies(templates.find((t) => t.id === e.target.value)?.copies ?? 1);
              }}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Each" htmlFor="copies">
            <Input id="copies" name="copies" type="number" min={1} max={10} value={copies} onChange={(e) => setCopies(Math.min(10, Math.max(1, Math.round(Number(e.target.value) || 1))))} className="w-20" />
          </Field>
          {template?.sheet && (
            <label className="flex h-10 items-center gap-2 text-sm">
              <input type="checkbox" name="single" value="1" checked={single} onChange={(e) => setSingle(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              One tag a page
            </label>
          )}
        </div>
      </Section>

      <Section bodyClassName="p-0">
        <div className="flex flex-wrap items-end gap-3 border-b p-4">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or position" className="pl-9" dir="auto" aria-label="Find staff" />
          </div>
          {divisions.length > 0 && (
            <Select value={division} onChange={(e) => setDivision(e.target.value)} className="w-auto" aria-label="Division">
              <option value="">Every division</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
              <option value={NONE}>No division</option>
            </Select>
          )}
          {roles.length > 1 && (
            <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-auto" aria-label="Role">
              <option value="">Every role</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </Select>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-3 border-b bg-muted/40 px-4 py-2 text-sm font-medium">
          <Checkbox checked={allOn} onCheckedChange={() => setAll(!allOn)} />
          {shown.length === people.length ? "Everyone" : "Everyone shown"}
          <span className="font-normal text-muted-foreground">
            ({chosen.length === shown.length ? shown.length : `${chosen.length} of ${shown.length} ticked`})
          </span>
        </label>
        <ul className="max-h-[55dvh] divide-y overflow-auto">
          {shown.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-2">
                <Checkbox
                  checked={picked.has(p.id)}
                  onCheckedChange={(v) =>
                    setPicked((cur) => {
                      const next = new Set(cur);
                      if (v === true) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium" dir="auto">
                    {p.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground" dir="auto">
                    {[p.title, roleLabel(p.role), p.divisionIds.map((d) => divisionName.get(d)).filter(Boolean).join(", ") || "no division"].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
            </li>
          ))}
          {!shown.length && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{people.length ? "Nobody matches." : "No staff in your divisions yet."}</li>}
        </ul>
      </Section>

      {/* only the people ticked and shown go */}
      {chosen.map((p) => (
        <input key={p.id} type="hidden" name="ids" value={p.id} />
      ))}
      <Button type="submit" size="lg" disabled={!chosen.length || !templateId}>
        <Printer /> Print {chosen.length * copies} {chosen.length * copies === 1 ? "tag" : "tags"}
      </Button>
      <p className="text-xs text-muted-foreground">Opens the tags in a new tab and brings up printing. Choose “Save as PDF” there to keep a file instead.</p>
    </form>
  );
}
