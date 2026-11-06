"use client";
import * as React from "react";
import { Printer, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/section";
import { PdfButton } from "@/components/print/pdf-button";

type Person = { name: string; position: string; division: string };
type Props = { people: Person[]; divisions: string[]; defaultQr: string };

const DESCRIPTION = "Make a 50 × 80 thermal tag on the spot: type it in, or pick someone from the staff list to fill it. Nothing is saved.";

/** On Print → Staff tags. */
export function QuickStaffTag(props: Props) {
  return (
    <div id="quick" className="scroll-mt-20">
      <Section title="Quick staff tag" description={DESCRIPTION}>
        <QuickTagForm {...props} />
      </Section>
    </div>
  );
}

/** On the Staff page (not everyone there has the print area): a button that opens it. */
export function QuickStaffTagButton(props: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Tag /> Quick staff tag
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Quick staff tag</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <QuickTagForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * A staff tag made on the spot: type a name and two lines (or pick someone from the staff list
 * to fill them), a QR code link if wanted, and print it or download the PDF for the label
 * printer. Nothing is saved: no template, no staff member added.
 */
function QuickTagForm({ people, divisions, defaultQr }: Props) {
  const [top, setTop] = React.useState("STAFF");
  const [name, setName] = React.useState("");
  const [line2, setLine2] = React.useState("");
  const [line3, setLine3] = React.useState("");
  const [withQr, setWithQr] = React.useState(false);
  const [qr, setQr] = React.useState(defaultQr);
  const [copies, setCopies] = React.useState(1);
  const params = new URLSearchParams({ top, name, line2, line3, ...(withQr && qr.trim() ? { qr } : {}), copies: String(copies) });
  const query = params.toString();
  // the preview catches up a moment after typing stops
  const [shown, setShown] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setShown(query), 500);
    return () => clearTimeout(t);
  }, [query]);
  const ready = Boolean(name.trim() || line2.trim() || line3.trim());
  const choose = (v: string) => {
    setName(v);
    const p = people.find((x) => x.name.toLowerCase() === v.trim().toLowerCase());
    if (p) {
      setLine2(p.position);
      setLine3(p.division);
    }
  };
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_auto]">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="On top" htmlFor="qt-top">
            <Input id="qt-top" value={top} onChange={(e) => setTop(e.target.value)} maxLength={30} placeholder="STAFF" />
          </Field>
          <Field label="Name" htmlFor="qt-name">
            <Input id="qt-name" list="qt-people" value={name} onChange={(e) => choose(e.target.value)} maxLength={60} placeholder="Leibel Kramer" autoComplete="off" />
            <datalist id="qt-people">
              {people.map((p) => (
                <option key={p.name} value={p.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Line 2" htmlFor="qt-line2">
            <Input id="qt-line2" value={line2} onChange={(e) => setLine2(e.target.value)} maxLength={60} placeholder="Counselor" />
          </Field>
          <Field label="Line 3 (bold)" htmlFor="qt-line3">
            <Input id="qt-line3" list="qt-divisions" value={line3} onChange={(e) => setLine3(e.target.value)} maxLength={60} placeholder="Division 3" autoComplete="off" />
            <datalist id="qt-divisions">
              {divisions.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={withQr} onCheckedChange={(v) => setWithQr(v === true)} /> QR code
        </label>
        {withQr && (
          <Field label="QR code link" htmlFor="qt-qr">
            <Input id="qt-qr" value={qr} onChange={(e) => setQr(e.target.value)} maxLength={300} placeholder="https://kinus.vercel.app" />
          </Field>
        )}
        <Field label="Copies" htmlFor="qt-copies" className="max-w-32">
          <Input id="qt-copies" type="number" min={1} max={10} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          {ready ? <PdfButton href={`/print/staff/quick?${query}&format=pdf`} label="Download PDF" size="default" /> : <Button disabled>Download PDF</Button>}
          {ready ? (
            <Button variant="outline" asChild>
              <a href={`/print/staff/quick?${query}`} target="_blank" rel="noreferrer">
                <Printer /> Print
              </a>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              <Printer /> Print
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="overflow-hidden rounded-md border bg-white shadow-sm" style={{ width: 190, height: 303 }}>
          {shown && ready ? (
            <iframe title="Preview" src={`/print/staff/quick?${shown}&preview=1`} className="pointer-events-none border-0" style={{ width: 190, height: 303 }} />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">Type a name to see the tag</div>
          )}
        </div>
        <span className="text-xs text-muted-foreground">50 × 80 mm</span>
      </div>
    </div>
  );
}
