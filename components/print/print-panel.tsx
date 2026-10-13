"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCheck, Printer, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markPrinted, saveSheetPosition } from "@/app/(app)/print/actions";
import { fitPreview } from "@/lib/print/fit-preview";
import { cleanUsed, freeLabels, sheetsUsed, usedAfter, usedBefore, type SheetStock } from "@/lib/print/sheet-position";
import { cn, plural } from "@/lib/utils";

export type PrintPart = { divisionId: string | null; name: string; color: string | null; tags: number };

/**
 * Prints one request, or several for the same tag together (all at once or one division at
 * a time). On label sheets (30 to a page…) it prints in the free labels of the sheet already
 * in the printer, and afterwards remembers which are used. The office can reset to a fresh
 * sheet, or set up another part-used sheet: where it starts, or which labels are gone.
 */
export function PrintPanel({
  jobIds,
  stock,
  remembered,
  parts,
  tags,
  open,
  autoPrint,
  canSplit,
}: {
  jobIds: string[];
  stock: SheetStock | null;
  /** The labels already used on the sheet in the printer, from the last print. */
  remembered: number[];
  parts: PrintPart[];
  tags: number;
  /** Not marked printed yet. */
  open: boolean;
  autoPrint?: boolean;
  /** Offer "one division at a time" (requests printed together). */
  canSplit?: boolean;
}) {
  const router = useRouter();
  const per = stock?.perSheet ?? 1;
  const [used, setUsed] = React.useState<number[]>(stock ? cleanUsed(remembered, per) : []);
  // what Kinus has saved for this sheet (changes here are saved when printed, or with Save)
  const [saved, setSaved] = React.useState<number[]>(stock ? cleanUsed(remembered, per) : []);
  const [picking, setPicking] = React.useState(false);
  const [split, setSplit] = React.useState(false);
  const [part, setPart] = React.useState<PrintPart | null>(null);
  const [done, setDone] = React.useState<Set<string>>(new Set());
  const [asking, setAsking] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const frame = React.useRef<HTMLIFrameElement>(null);
  const auto = React.useRef(Boolean(autoPrint));

  const multi = split && parts.length > 1;
  const current = multi ? part : null;
  const count = current ? current.tags : tags;
  const partKey = (p: PrintPart) => p.divisionId ?? "none";
  const params = new URLSearchParams({ jobs: jobIds.join(",") });
  if (stock && used.length) params.set("used", used.join(","));
  if (current) params.set("division", partKey(current));
  const src = `/print/sheet?${params}`;

  React.useEffect(() => setReady(false), [src]);
  const print = React.useCallback(() => {
    frame.current?.contentWindow?.print();
    setAsking(true);
  }, []);
  React.useEffect(() => {
    if (!ready || !auto.current) return;
    auto.current = false;
    print();
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [ready, print]);

  const after = stock ? usedAfter(used, count, per) : [];
  const nextFree = freeLabels(after, per)[0] ?? 1;
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((n, i) => n === b[i]);
  const keepSheet = (u: number[], message?: string) =>
    startTransition(async () => {
      if (!stock) return;
      const r = await saveSheetPosition(stock.key, u).catch(() => ({ ok: false as const, error: "Couldn't save that: check the connection and try again." }));
      if (!r.ok) return void toast.error(r.error);
      setUsed(u);
      setSaved(u);
      toast.success(message ?? r.message ?? "Saved.");
    });
  const confirm = () =>
    startTransition(async () => {
      setAsking(false);
      const sheet = stock ? { stock: stock.key, used: after } : undefined;
      const finished = !multi || (current && parts.every((p) => done.has(partKey(p)) || partKey(p) === partKey(current)));
      const r = await (finished ? markPrinted(jobIds, true, sheet, true) : sheet ? saveSheetPosition(sheet.stock, sheet.used) : Promise.resolve({ ok: true as const, message: undefined })).catch(() => ({
        ok: false as const,
        error: "Couldn't save that: check the connection, then tap Yes again.",
      }));
      if (!r.ok) {
        setAsking(true);
        return void toast.error(r.error);
      }
      toast.success(finished ? (jobIds.length > 1 ? `Marked ${jobIds.length} requests printed.` : "Marked printed.") : `${current?.name} printed.`);
      if (stock) {
        setUsed(after);
        setSaved(after);
      }
      if (current) {
        setDone((d) => new Set([...d, partKey(current)]));
        setPart(parts.find((p) => !done.has(partKey(p)) && partKey(p) !== partKey(current)) ?? null);
      }
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {canSplit && parts.length > 1 && (
        <div className="space-y-2">
          <div className="inline-flex w-full flex-wrap gap-1 rounded-lg bg-muted p-1 sm:w-auto">
            {(
              [
                [false, `All together (${plural(tags, "tag")})`],
                [true, "One division at a time"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => {
                  setSplit(v);
                  setPart(v ? (parts.find((p) => !done.has(partKey(p))) ?? parts[0]) : null);
                }}
                className={cn("flex-1 rounded-md px-3 py-1.5 text-sm sm:flex-none", split === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
          {multi && (
            <div className="flex flex-wrap gap-2">
              {parts.map((p) => {
                const on = current && partKey(p) === partKey(current);
                return (
                  <button
                    key={partKey(p)}
                    type="button"
                    onClick={() => setPart(p)}
                    aria-pressed={Boolean(on)}
                    className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary-soft font-medium text-primary" : "bg-card hover:bg-muted")}
                  >
                    {done.has(partKey(p)) ? <Check className="size-3.5 text-emerald-600" /> : <span className="size-2 rounded-full" style={{ background: p.color ?? "var(--muted-foreground)" }} />}
                    <span dir="auto">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.tags}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {stock && (
        <div className="space-y-3 rounded-xl border bg-card p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              The label sheet in the printer
              <span className="font-normal text-muted-foreground">
                {" "}
                · {used.length ? `${used.length} used, ${per - used.length} free` : "a fresh sheet"} · this print uses {plural(sheetsUsed(used, count, per), "sheet")}
              </span>
            </p>
          </div>
          <div className="inline-flex w-full flex-wrap gap-1 rounded-lg bg-muted p-1 sm:w-auto">
            {(
              [
                [false, "Tap where it starts"],
                [true, "Tap each used label"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setPicking(v)}
                aria-pressed={picking === v}
                className={cn("flex-1 rounded-md px-3 py-1 text-xs sm:flex-none", picking === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {saved.length && same(used, saved)
              ? "This is the sheet from the last print. Put it back in the printer, or start a fresh sheet if it's gone."
              : picking
                ? "Tap every label that's already gone (they can be anywhere on the sheet); tap again to undo."
                : "Using another part-used sheet? Tap its first free label: everything before it counts as used."}
          </p>
          <div
            className="grid w-full gap-[3px] rounded-md bg-white p-1.5 ring-1 ring-border"
            style={{ gridTemplateColumns: `repeat(${stock.cols}, minmax(0, 1fr))`, maxWidth: `${Math.min(18, Math.max(8, stock.cols * 4.5))}rem` }}
          >
            {(() => {
              const willPrint = new Set(freeLabels(used, per).slice(0, count));
              return Array.from({ length: per }, (_, i) => {
                const n = i + 1;
                const gone = used.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    title={gone ? `Label ${n}: used` : willPrint.has(n) ? `Label ${n}: prints here` : `Label ${n}: free`}
                    aria-label={picking ? `Label ${n} ${gone ? "used" : "free"}` : `Start at label ${n}`}
                    aria-pressed={picking ? gone : undefined}
                    onClick={() => setUsed(picking ? cleanUsed(gone ? used.filter((x) => x !== n) : [...used, n], per) : usedBefore(n, per))}
                    style={{ aspectRatio: `${stock.labelW} / ${stock.labelH}` }}
                    className={cn(
                      "min-h-2.5 rounded-[2px] border transition-colors",
                      gone ? "border-transparent bg-[repeating-linear-gradient(45deg,#e2e8f0_0_3px,#f8fafc_3px_6px)]" : willPrint.has(n) ? "border-primary/50 bg-primary/70" : "border-border bg-white hover:bg-primary-soft",
                    )}
                  />
                );
              });
            })()}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending || (!used.length && !saved.length)}
              onClick={() => keepSheet([], "Fresh sheet. Kinus starts from label 1 now, and next time.")}
              title="The last sheet was thrown out or can't be found"
            >
              <RotateCcw /> Fresh sheet
            </Button>
            {!same(used, saved) && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => keepSheet(used)}>
                <Save /> Remember this sheet
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Preview{current ? ` · ${current.name}` : ""} <span className="font-normal text-muted-foreground">· {plural(count, "tag")}</span>
        </h2>
        <Button onClick={print} disabled={!ready || (multi && !current)}>
          <Printer /> {ready ? "Print" : "Preparing…"}
        </Button>
      </div>

      {asking && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft/40 p-3">
          <span className="mr-auto text-sm font-medium">Did {current ? `${current.name}'s` : "they"} print properly?</span>
          <Button size="sm" disabled={pending} onClick={confirm}>
            <CheckCheck /> {multi && current && !parts.every((p) => done.has(partKey(p)) || partKey(p) === partKey(current)) ? "Yes" : open ? "Yes, mark printed" : "Yes"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
            Not yet
          </Button>
          {stock && (
            <p className="basis-full text-xs text-muted-foreground">
              Kinus then remembers the sheet: {after.length ? `the next print starts at label ${nextFree}` : "the next print starts on a fresh sheet"}.
            </p>
          )}
        </div>
      )}

      <iframe
        key={src}
        ref={frame}
        src={src}
        title="Tags to print"
        className="h-[60vh] w-full rounded-xl border bg-muted"
        onLoad={() => {
          const doc = frame.current?.contentDocument;
          let tries = 0;
          const wait = () => {
            if (!doc?.body?.getAttribute("data-fitted") && tries++ < 150) return void setTimeout(wait, 100);
            fitPreview(frame.current);
            setReady(true);
          };
          wait();
        }}
      />
    </div>
  );
}
