"use client";
import * as React from "react";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { findPresets, PRESET_GROUPS, presetSummary, type LabelPreset } from "@/lib/print/presets";
export { currentPreset } from "@/lib/print/presets";
import { sheetPlacement, type SheetLayout } from "@/lib/print/types";
import { cn } from "@/lib/utils";

const PAPER = { letter: [215.9, 279.4], a4: [210, 297] } as const;
const inches = (mm: number) => {
  const v = mm / 25.4;
  return Math.abs(v - Math.round(v * 8) / 8) < 0.01 ? `${+(Math.round(v * 8) / 8).toFixed(3)}″` : `${v.toFixed(2)}″`;
};

/** "2.63″ × 1″ (66.7 × 25.4 mm)". */
export const sizeText = (w: number, h: number) => `${inches(w)} × ${inches(h)} (${+w.toFixed(1)} × ${+h.toFixed(1)} mm)`;

/** A small drawing of the sheet with every label in place, so the layout can be checked at a glance. */
export function SheetDiagram({ sheet, w, h, round, className }: { sheet: SheetLayout; w: number; h: number; round?: boolean; className?: string }) {
  const [pw, ph] = PAPER[sheet.paper] ?? PAPER.letter;
  const at = sheetPlacement(sheet, w, h, pw);
  const cells = [];
  for (let r = 0; r < sheet.rows; r++)
    for (let c = 0; c < sheet.cols; c++) {
      const x = at.left + c * at.pitchX + (sheet.shiftXMm ?? 0);
      const y = at.top + r * at.pitchY + (sheet.shiftYMm ?? 0);
      const out = x < -0.05 || y < -0.05 || x + w > pw + 0.05 || y + h > ph + 0.05;
      cells.push(<rect key={`${r}-${c}`} x={x} y={y} width={w} height={h} rx={round ? w / 2 : Math.min(w, h) * 0.06} ry={round ? h / 2 : undefined} className={out ? "fill-red-200 stroke-red-500" : "fill-primary-soft stroke-primary/60"} strokeWidth={0.6} />);
    }
  return (
    <svg viewBox={`0 0 ${pw} ${ph}`} className={cn("h-auto w-28 shrink-0 rounded-sm bg-white shadow-sm ring-1 ring-border", className)} role="img" aria-label={`${sheet.cols} across, ${sheet.rows} down`}>
      {cells}
    </svg>
  );
}

/** Choose the label stock: type the number on the box, or browse by kind. */
export function LabelPicker({ open, onOpenChange, current, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; current: LabelPreset | null; onPick: (p: LabelPreset | null) => void }) {
  const [q, setQ] = React.useState("");
  const found = findPresets(q);
  const groups = (Object.keys(PRESET_GROUPS) as LabelPreset["group"][]).map((g) => [g, found.filter((p) => p.group === g)] as const).filter(([, list]) => list.length);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Which labels are you printing on?</DialogTitle>
          <DialogDescription>Type the number on the box (Avery 5160, 8395, L7160, Dymo 30252…) or a size. Sheets are laid out exactly as the maker publishes them.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 5160 or name badge" className="pl-9" />
        </div>
        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
          {groups.map(([g, list]) => (
            <section key={g} className="py-2">
              <h3 className="sticky top-0 z-10 bg-background py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{PRESET_GROUPS[g]}</h3>
              <ul className="divide-y rounded-lg border">
                {list.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onPick(p)}
                      className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60", current?.id === p.id && "bg-primary-soft/60")}
                    >
                      {p.sheet ? <SheetDiagram sheet={p.sheet} w={p.widthMm} h={p.heightMm} round={p.shape === "round"} className="w-9" /> : <span className="flex h-12 w-9 shrink-0 items-center justify-center"><span className="block rounded-sm bg-primary-soft ring-1 ring-primary/50" style={{ width: 34, height: Math.max(8, (34 * p.heightMm) / p.widthMm) }} /></span>}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {p.brand} {p.product}
                          <span className="font-normal text-muted-foreground"> · {p.name}</span>
                        </span>
                        <span className="block text-xs text-muted-foreground">{presetSummary(p)}</span>
                        {p.alsoFits.length > 0 && <span className="block truncate text-xs text-muted-foreground">Same layout: {p.alsoFits.join(", ")}</span>}
                      </span>
                      {current?.id === p.id && <Check className="size-4 shrink-0 text-primary" />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!groups.length && <p className="py-6 text-center text-sm text-muted-foreground">Nothing matches “{q}”. Use a custom size below and measure a label with a ruler.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">Not listed? Set the size and layout yourself.</p>
          <Button variant="outline" size="sm" onClick={() => onPick(null)}>
            Custom size
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
