"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { applyTransforms, fill } from "@/lib/print/merge";
import type { Transform, ValueMap } from "@/lib/print/types";
import { deleteField, deleteValueMap, saveField, saveValueMap, setFieldEnabled } from "@/app/(app)/print/actions";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type FieldRow = { id: string; key: string; label: string; source_field: string; transforms: Transform[]; enabled: boolean };
type Source = { key: string; label: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isPlain = (t: Extract<Transform, { type: "replace" }>) => t.flags?.includes("g") && !/[.*+?^${}()|[\]\\]/.test(t.pattern.replace(/\\[.*+?^${}()|[\]\\]/g, ""));
const unescapeRe = (s: string) => s.replace(/\\([.*+?^${}()|[\]\\])/g, "$1");

function describeTransform(t: Transform, maps: ValueMap[]): string {
  if (t.type === "value_map") return `convert with “${maps.find((m) => m.id === t.map_id)?.name ?? "a deleted table"}”`;
  if (t.type === "case") return t.mode === "upper" ? "CAPITALS" : t.mode === "lower" ? "lower case" : "Title Case";
  return isPlain(t) ? `replace “${unescapeRe(t.pattern)}” with “${t.replacement}”` : "reshape it (an advanced pattern; open to see it)";
}

export function FieldsEditor({ fields, maps, catalog, sample, sampleName }: { fields: FieldRow[]; maps: ValueMap[]; catalog: Source[]; sample: Record<string, string>; sampleName: string }) {
  const [editing, setEditing] = React.useState<FieldRow | "new" | null>(null);
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const mapById = React.useMemo(() => new Map(maps.map((m) => [m.id, m])), [maps]);
  const raw = (source: string) => (source.includes("{{") ? fill(source, (k) => sample[k] ?? "") : (sample[source] ?? ""));
  const example = (f: Pick<FieldRow, "source_field" | "transforms">) => applyTransforms(raw(f.source_field), f.transforms, mapById);
  const sourceLabel = (s: string) => (s.startsWith("source.") ? `the export's “${s.slice(7)}” column` : (catalog.find((c) => c.key === s)?.label ?? fields.find((f) => f.key === s)?.label ?? s));
  // "{{source.ppa.hebrew_name|FIRST}} {{LAST}}" → "the export's “ppa.hebrew_name” column (or else First name) + Last name"
  const describeSource = (s: string) =>
    [...s.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)]
      .map((m) => {
        const [first, ...rest] = m[1].split("|").map((k) => sourceLabel(k.trim()));
        return rest.length ? `${first} (or else ${rest.join(", or ")})` : first;
      })
      .join(" + ");

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Fields</h2>
            <p className="text-sm text-muted-foreground">{sampleName ? `Examples use ${sampleName}.` : "Import campers to see examples."}</p>
          </div>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> New field
          </Button>
        </div>
        {(
          [
            [true, "On the merge list", "Offered when designing tags, and in the data for Publisher."],
            [false, "Not on the list", "Available to switch on. A template that already uses one still prints it."],
          ] as const
        ).map(([on, title, hint]) => {
          const list = fields.filter((f) => f.enabled === on);
          if (!list.length) return null;
          return (
            <div key={title} className="space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2 px-1">
                <h3 className="text-sm font-semibold">
                  {title} ({list.length})
                </h3>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </div>
              <div className={cn("overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]", !on && "opacity-80")}>
                <ul className="divide-y">
                  {list.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 pr-4">
                      <button type="button" onClick={() => setEditing(f)} className="grid min-w-0 flex-1 gap-1 px-4 py-3 text-left hover:bg-muted/50 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,200px)] md:items-center md:gap-4">
                        <span>
                          <span className="block font-mono text-sm font-semibold">{`{{${f.key}}}`}</span>
                          <span className="block text-xs text-muted-foreground">{f.label}</span>
                        </span>
                        <span className="text-sm text-muted-foreground">
                          From {f.source_field.includes("{{") ? describeSource(f.source_field) : sourceLabel(f.source_field)}
                          {f.transforms.length > 0 && <>, then {f.transforms.map((t) => describeTransform(t, maps)).join(", then ")}</>}
                        </span>
                        <span className="flex items-center gap-2 truncate text-sm" dir="auto">
                          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground md:hidden" />
                          {example(f) || <span className="text-muted-foreground">(empty)</span>}
                        </span>
                      </button>
                      <label className="flex shrink-0 flex-col items-center gap-1 text-[11px] text-muted-foreground">
                      <Switch
                        checked={f.enabled}
                        disabled={pending}
                        onCheckedChange={(v) =>
                          start(async () => {
                            const r = await setFieldEnabled(f.id, v);
                            if (!r.ok) return void toast.error(r.error);
                            toast.success(`{{${f.key}}}: ${r.message}`);
                            router.refresh();
                          })
                        }
                        aria-label={`${f.label} on the mail merge list`}
                      />
                        {f.enabled ? "On list" : "Off list"}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Conversion tables</h2>
          <p className="text-sm text-muted-foreground">One line each: what the registration says = what goes on the tag. Capitals and extra spaces don&apos;t matter.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {maps.map((m) => (
            <MapCard key={m.id} map={m} />
          ))}
          <MapCard map={null} />
        </div>
      </section>

      <FieldDialog field={editing} onClose={() => setEditing(null)} maps={maps} catalog={catalog} example={example} />
    </div>
  );
}

function MapCard({ map }: { map: ValueMap | null }) {
  const lines = map ? map.entries.map((e) => `${e.source_value} = ${e.output_value}`).join("\n") : "";
  return (
    <ActionForm action={saveValueMap} className="space-y-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]" resetOnSuccess={!map}>
      <input type="hidden" name="id" value={map?.id ?? ""} />
      <Field label={map ? "Name" : "New conversion table"} htmlFor={`map-${map?.id ?? "new"}`}>
        <Input id={`map-${map?.id ?? "new"}`} name="name" defaultValue={map?.name ?? ""} placeholder="e.g. Bus numbers" required />
      </Field>
      <Textarea name="entries" defaultValue={lines} rows={map ? Math.min(12, Math.max(4, map.entries.length + 1)) : 4} placeholder={"youth small = YS\nyouth medium = YM"} className="font-mono text-sm" dir="auto" aria-label="Conversions" />
      <div className="flex justify-between gap-2">
        <Button type="submit" size="sm" variant={map ? "outline" : "default"}>
          {map ? "Save" : "Add table"}
        </Button>
        {map && (
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            className="text-destructive"
            formAction={async (fd) => {
              const r = await deleteValueMap(fd);
              if (r.ok) toast.success(r.message);
              else toast.error(r.error);
            }}
          >
            <Trash2 /> Delete
          </Button>
        )}
      </div>
    </ActionForm>
  );
}

type Editable = { key: string; label: string; source_field: string; transforms: Transform[] };

function FieldDialog({
  field,
  onClose,
  maps,
  catalog,
  example,
}: {
  field: FieldRow | "new" | null;
  onClose: () => void;
  maps: ValueMap[];
  catalog: Source[];
  example: (f: Pick<FieldRow, "source_field" | "transforms">) => string;
}) {
  const router = useRouter();
  const [f, setF] = React.useState<Editable>({ key: "", label: "", source_field: "first_name", transforms: [] });
  const [custom, setCustom] = React.useState(false);
  const [pending, start] = React.useTransition();
  React.useEffect(() => {
    if (!field) return;
    const v = field === "new" ? { key: "", label: "", source_field: "first_name", transforms: [] } : { key: field.key, label: field.label, source_field: field.source_field, transforms: field.transforms };
    setF(v);
    setCustom(v.source_field.includes("{{") || !catalog.some((c) => c.key === v.source_field));
  }, [field, catalog]);
  const setT = (i: number, t: Transform) => setF((cur) => ({ ...cur, transforms: cur.transforms.map((x, j) => (j === i ? t : x)) }));
  const out = example(f);

  return (
    <Dialog open={Boolean(field)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{field === "new" ? "New field" : `{{${f.key}}}`}</DialogTitle>
          <DialogDescription>Put it on a tag as {`{{${f.key || "NAME"}}}`}, or use the name in Publisher.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Field name" htmlFor="fkey" hint="Capitals, no spaces: TSHIRT, DIV, BUS.">
              <Input id="fkey" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} className="font-mono" />
            </Field>
            <Field label="Description" htmlFor="flabel">
              <Input id="flabel" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="T-shirt code" />
            </Field>
          </div>
          <Field label="Starts from" htmlFor="fsource">
            <Select
              id="fsource"
              value={custom ? "__custom" : f.source_field}
              onChange={(e) => {
                if (e.target.value === "__custom") {
                  setCustom(true);
                  setF({ ...f, source_field: `{{${f.source_field.replace(/[{}]/g, "")}}}` });
                } else {
                  setCustom(false);
                  setF({ ...f, source_field: e.target.value });
                }
              }}
            >
              {catalog.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
              <option value="__custom">Several details combined…</option>
            </Select>
          </Field>
          {custom && (
            <Field label="Combination" htmlFor="fcombo" hint={`Camper details in {{ }}: ${catalog.slice(0, 6).map((c) => `{{${c.key}}}`).join(" ")} …`}>
              <Input id="fcombo" value={f.source_field} onChange={(e) => setF({ ...f, source_field: e.target.value })} className="font-mono" dir="auto" />
            </Field>
          )}

          <div className="space-y-2">
            <div className="text-sm font-medium">Then change it</div>
            {f.transforms.length === 0 && <p className="text-sm text-muted-foreground">Nothing: used as it is.</p>}
            {f.transforms.map((t, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
                <span className="w-6 text-sm text-muted-foreground">{i + 1}.</span>
                {t.type === "value_map" && (
                  <>
                    <label className="min-w-40 flex-1 space-y-1">
                      <span className="block text-xs text-muted-foreground">Convert with</span>
                      <Select value={t.map_id} onChange={(e) => setT(i, { ...t, map_id: e.target.value })} className="h-9">
                        {maps.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="space-y-1">
                      <span className="block text-xs text-muted-foreground">If it&apos;s not in the table</span>
                      <Select value={t.fallback ?? "original"} onChange={(e) => setT(i, { ...t, fallback: e.target.value as "original" })} className="h-9">
                        <option value="original">keep it as it is</option>
                        <option value="blank">leave it empty</option>
                      </Select>
                    </label>
                  </>
                )}
                {t.type === "replace" && (
                  <ReplaceEditor t={t} onChange={(n) => setT(i, n)} />
                )}
                {t.type === "case" && (
                  <label className="min-w-40 flex-1 space-y-1">
                    <span className="block text-xs text-muted-foreground">Letters</span>
                    <Select value={t.mode} onChange={(e) => setT(i, { ...t, mode: e.target.value as "upper" })} className="h-9">
                      <option value="upper">ALL CAPITALS</option>
                      <option value="lower">all lower case</option>
                      <option value="title">Title Case</option>
                    </Select>
                  </label>
                )}
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setF({ ...f, transforms: f.transforms.filter((_, j) => j !== i) })} aria-label="Remove this step">
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!maps.length} onClick={() => setF({ ...f, transforms: [...f.transforms, { type: "value_map", map_id: maps[0]?.id ?? "", fallback: "original" }] })}>
                Convert with a table
              </Button>
              <Button size="sm" variant="outline" onClick={() => setF({ ...f, transforms: [...f.transforms, { type: "replace", pattern: "", replacement: "", flags: "gi" }] })}>
                Replace text
              </Button>
              <Button size="sm" variant="outline" onClick={() => setF({ ...f, transforms: [...f.transforms, { type: "case", mode: "upper" }] })}>
                Change capitals
              </Button>
            </div>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
            Example: <span className="font-semibold" dir="auto">{out || "(empty)"}</span>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {field && field !== "new" ? (
            <ActionForm action={deleteField} onSuccess={onClose} confirm={`Delete {{${field.key}}}? Templates that use it will leave that spot empty.`}>
              <input type="hidden" name="id" value={field.id} />
              <Button type="submit" variant="ghost" className="text-destructive">
                Delete field
              </Button>
            </ActionForm>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveField({ ...f, id: field && field !== "new" ? field.id : undefined });
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(r.message);
                  onClose();
                  router.refresh();
                })
              }
            >
              Save field
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Plain "replace X with Y" for most people; a pattern for the rest. */
function ReplaceEditor({ t, onChange }: { t: Extract<Transform, { type: "replace" }>; onChange: (t: Extract<Transform, { type: "replace" }>) => void }) {
  const [advanced, setAdvanced] = React.useState(() => Boolean(t.pattern) && !isPlain(t));
  return (
    <>
      <label className="min-w-32 flex-1 space-y-1">
        <span className="block text-xs text-muted-foreground">{advanced ? "Pattern" : "Replace"}</span>
        <Input
          value={advanced ? t.pattern : unescapeRe(t.pattern)}
          onChange={(e) => onChange({ ...t, pattern: advanced ? e.target.value : escapeRe(e.target.value), flags: advanced ? (t.flags ?? "i") : "gi" })}
          className="h-9 font-mono"
          dir="auto"
          placeholder={advanced ? "^Division\\s+(\\d+)$" : "Division "}
        />
      </label>
      <label className="min-w-32 flex-1 space-y-1">
        <span className="block text-xs text-muted-foreground">with</span>
        <Input value={t.replacement} onChange={(e) => onChange({ ...t, replacement: e.target.value })} className="h-9 font-mono" dir="auto" placeholder={advanced ? "$1" : "(nothing)"} />
      </label>
      <label className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
        <input type="checkbox" className="size-3.5" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /> pattern
      </label>
    </>
  );
}
