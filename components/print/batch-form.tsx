"use client";
import * as React from "react";
import { FileSpreadsheet, Mail, Printer } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RadioCards } from "@/components/ui/radio-cards";
import { BATCH_WHICH_LABELS, type BatchWhichKey } from "@/lib/print/batch-labels";
import { countBatch, createBatch } from "@/app/(app)/print/actions";

type Division = { id: string; name: string; bunks: { id: string; name: string }[] };

export function BatchForm({ templates, divisions, campLabel, officeTo }: { templates: { id: string; name: string }[]; divisions: Division[]; campLabel: string; officeTo: string }) {
  const [template, setTemplate] = React.useState(templates[0]?.id ?? "");
  const [where, setWhere] = React.useState("");
  const [which, setWhich] = React.useState<BatchWhichKey>("not_printed");
  const [deliver, setDeliver] = React.useState<"here" | "email">("here");
  const [count, setCount] = React.useState<number | null>(null);
  React.useEffect(() => {
    let live = true;
    setCount(null);
    countBatch(template, where, which).then((n) => live && setCount(n));
    return () => {
      live = false;
    };
  }, [template, where, which]);
  const csv = `/print/export?${new URLSearchParams({ where, which, template })}`;

  return (
    <ActionForm action={createBatch} className="grid max-w-2xl gap-5 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
      <Field label="What to print" htmlFor="template_id">
        <Select id="template_id" name="template_id" value={template} onChange={(e) => setTemplate(e.target.value)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="For whom" htmlFor="where">
        <Select id="where" name="where" value={where} onChange={(e) => setWhere(e.target.value)}>
          <option value="">{campLabel}</option>
          {divisions.map((d) => (
            <optgroup key={d.id} label={d.name}>
              <option value={`d:${d.id}`}>All of {d.name}</option>
              {d.bunks.map((b) => (
                <option key={b.id} value={`b:${b.id}`}>
                  {b.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      <Field label="Which campers" htmlFor="which">
        <Select id="which" name="which" value={which} onChange={(e) => setWhich(e.target.value as BatchWhichKey)}>
          {(Object.keys(BATCH_WHICH_LABELS) as BatchWhichKey[]).map((k) => (
            <option key={k} value={k}>
              {BATCH_WHICH_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Copies of each" htmlFor="copies">
        <Input id="copies" name="copies" type="number" min={1} max={10} defaultValue={1} className="w-24" />
      </Field>
      <RadioCards
        name="deliver"
        defaultValue="here"
        columns={2}
        onChange={(v) => setDeliver(v as "here" | "email")}
        options={[
          { value: "here", label: "Print here now", description: "Opens the print dialog on this computer." },
          { value: "email", label: "Email the PDF", description: officeTo ? `To ${officeTo}, or another address.` : "To any address." },
        ]}
      />
      {deliver === "email" && (
        <Field label="Send to" htmlFor="deliver_to" hint="Leave empty for the office email.">
          <Input id="deliver_to" name="deliver_to" type="email" placeholder={officeTo || "office@…"} />
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={!template || count === 0}>
          {deliver === "here" ? <Printer /> : <Mail />}
          {count === null ? "Counting…" : count === 0 ? "No campers match" : `${deliver === "here" ? "Print" : "Email"} ${count} ${count === 1 ? "tag" : "tags"}`}
        </Button>
        <Button asChild variant="outline">
          <a href={csv}>
            <FileSpreadsheet /> Data for Publisher (CSV)
          </a>
        </Button>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        The CSV has one row per camper with every merge field (FIRST, TSHIRT, DIV…) already converted, for Publisher&apos;s Mailings → Use an existing list.
      </p>
    </ActionForm>
  );
}
