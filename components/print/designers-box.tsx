"use client";
import * as React from "react";
import { toast } from "sonner";
import { Paintbrush, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { setDesigner } from "@/app/(app)/print/actions";

/** Directors over all of camp choose which other staff may make and change templates. */
export function DesignersBox({ designers, staff }: { designers: { id: string; name: string; role: string }[]; staff: { id: string; name: string; role: string }[] }) {
  const [pick, setPick] = React.useState("");
  const [pending, start] = React.useTransition();
  const run = (id: string, on: boolean) =>
    start(async () => {
      const r = await setDesigner(id, on).catch(() => ({ ok: false as const, error: "Couldn't save that: check the connection and try again." }));
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Saved.");
      setPick("");
    });
  const choices = staff.filter((s) => !designers.some((d) => d.id === s.id));
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Paintbrush className="size-4 text-muted-foreground" /> Who can edit templates
        </h2>
        <p className="text-sm text-muted-foreground">
          Directors over all of camp always can. Allow others here: they can make and change templates, fields and conversions, and see the previews. Nothing else changes for
          them.
        </p>
      </div>
      {designers.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {designers.map((d) => (
            <li key={d.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-sm">
              <span dir="auto">{d.name}</span>
              <span className="text-xs text-muted-foreground">· {d.role}</span>
              <button type="button" disabled={pending} onClick={() => run(d.id, false)} className="ml-1 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Stop ${d.name} editing templates`}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={pick} onChange={(e) => setPick(e.target.value)} className="w-auto min-w-56" aria-label="Someone on staff">
          <option value="">Choose someone on staff…</option>
          {choices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.role})
            </option>
          ))}
        </Select>
        <Button size="sm" variant="outline" disabled={!pick || pending} onClick={() => run(pick, true)}>
          Allow
        </Button>
      </div>
    </section>
  );
}
