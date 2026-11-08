"use client";
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteCheckoutSetup, saveCheckoutSetup } from "@/app/(app)/checkout/setup/actions";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import type { CheckoutSetup } from "@/lib/checkout/setups";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };
type Draft = { key: string; id?: string; name: string; camps: string[]; mode: "all" | "some"; kinds: string[] };

const draftOf = (s: CheckoutSetup): Draft => ({ key: s.id, id: s.id, name: s.name, camps: s.camps, mode: s.who === "all" ? "all" : "some", kinds: s.who === "all" ? [] : s.who });

function Chips({ options, value, onChange }: { options: Option[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={cn("rounded-full border px-3 py-1.5 text-sm", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SetupCard({ draft, camps, kinds, onGone }: { draft: Draft; camps: Option[]; kinds: Option[]; onGone: () => void }) {
  const router = useRouter();
  const [d, setD] = React.useState(draft);
  const [busy, start] = React.useTransition();
  const save = () =>
    start(async () => {
      const r = await saveCheckoutSetup({ id: d.id, name: d.name, camps: d.camps, who: d.mode === "all" ? "all" : d.kinds });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.refresh();
      if (!d.id) onGone();
    });
  const remove = () =>
    start(async () => {
      if (!d.id) return onGone();
      if (!window.confirm(`Remove “${d.name}”? Nobody it's for can check out with it any more.`)) return;
      const r = await deleteCheckoutSetup(d.id);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.refresh();
    });
  return (
    <Section title={d.id ? d.name : "New final check-out"}>
      <div className="space-y-4">
        <Field label="Name" htmlFor={`n-${d.key}`}>
          <Input id={`n-${d.key}`} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={60} placeholder="American & French" />
        </Field>
        <div className="space-y-1.5">
          <div className="text-sm font-medium">Camps</div>
          <Chips options={camps} value={d.camps} onChange={(v) => setD({ ...d, camps: v })} />
          <p className="text-xs text-muted-foreground">Anyone it&apos;s for who works in one of these camps checks out any camper of all of them.</p>
        </div>
        <div className="space-y-1.5">
          <div className="text-sm font-medium">Who can do it</div>
          <Segmented
            value={d.mode}
            options={[
              { value: "all", label: "Every account" },
              { value: "some", label: "Only some kinds" },
            ]}
            onChange={(mode) => setD({ ...d, mode })}
          />
          {d.mode === "some" && <Chips options={kinds} value={d.kinds} onChange={(v) => setD({ ...d, kinds: v })} />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : d.id ? "Save" : "Set up"}
          </Button>
          <Button variant="outline" onClick={remove} disabled={busy}>
            <Trash2 /> {d.id ? "Remove" : "Cancel"}
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** The final check-outs (Final check-out → Set up): as many as needed, each its camps and who may use it. */
export function CheckoutSetups({ setups, camps, kinds }: { setups: CheckoutSetup[]; camps: Option[]; kinds: Option[] }) {
  const [fresh, setFresh] = React.useState<Draft[]>([]);
  return (
    <div className="space-y-4">
      {setups.length === 0 && fresh.length === 0 && <p className="text-sm text-muted-foreground">None set up yet. Directors over all of camp can always do final check-out.</p>}
      {setups.map((s) => (
        <SetupCard key={`${s.id}-${s.name}-${s.camps.join()}-${s.who === "all" ? "all" : s.who.join()}`} draft={draftOf(s)} camps={camps} kinds={kinds} onGone={() => undefined} />
      ))}
      {fresh.map((f) => (
        <SetupCard key={f.key} draft={f} camps={camps} kinds={kinds} onGone={() => setFresh((x) => x.filter((y) => y.key !== f.key))} />
      ))}
      <Button variant="outline" onClick={() => setFresh((x) => [...x, { key: `new-${Date.now()}`, name: "", camps: [], mode: "some", kinds: ["scanner", "checkin_login"] }])}>
        <Plus /> Add a final check-out
      </Button>
    </div>
  );
}
