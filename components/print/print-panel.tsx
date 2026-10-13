"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCheck, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markPrinted, saveSheetPosition } from "@/app/(app)/print/actions";
import { fitPreview } from "@/lib/print/fit-preview";
import { clampPosition, nextPosition, sheetsUsed, type SheetStock } from "@/lib/print/sheet-position";
import { cn, plural } from "@/lib/utils";

export type PrintPart = { divisionId: string | null; name: string; color: string | null; tags: number };

/**
 * Prints one request, or several for the same tag together (all at once or one division at
 * a time). On label sheets (30 to a page…) it starts at the first free label of the sheet
 * already in the printer, and afterwards remembers where the next print continues.
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
  /** The first free label on the part-used sheet, from the last print. */
  remembered: number;
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
  const [start, setStart] = React.useState(stock ? clampPosition(remembered, per) : 1);
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
  if (stock && start > 1) params.set("start", String(start));
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

  const next = stock ? nextPosition(start, count, per) : 1;
  const confirm = () =>
    startTransition(async () => {
      setAsking(false);
      const sheet = stock ? { stock: stock.key, next } : undefined;
      const finished = !multi || (current && parts.every((p) => done.has(partKey(p)) || partKey(p) === partKey(current)));
      const r = finished ? await markPrinted(jobIds, true, sheet, true) : sheet ? await saveSheetPosition(sheet.stock, sheet.next) : { ok: true as const, message: undefined };
      if (!r.ok) return void toast.error(r.error);
      toast.success(finished ? (jobIds.length > 1 ? `Marked ${jobIds.length} requests printed.` : "Marked printed.") : `${current?.name} printed.`);
      if (stock) setStart(next);
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
        <div className="space-y-2 rounded-xl border bg-card p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              Start at label {start} of {per}
              <span className="font-normal text-muted-foreground"> · {plural(sheetsUsed(start, count, per), "sheet")}</span>
            </p>
            {start !== 1 && (
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setStart(1)}>
                Use a fresh sheet
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {remembered > 1 && start === remembered
              ? `Your part-used sheet: labels 1–${remembered - 1} were used last time. Put it back in the printer.`
              : "Tap the first free label on the sheet in the printer."}
          </p>
          <div
            className="grid w-full gap-[3px] rounded-md bg-white p-1.5 ring-1 ring-border"
            style={{ gridTemplateColumns: `repeat(${stock.cols}, minmax(0, 1fr))`, maxWidth: `${Math.min(18, Math.max(8, stock.cols * 4.5))}rem` }}
          >
            {Array.from({ length: per }, (_, i) => {
              const n = i + 1;
              const used = n < start;
              const filled = n >= start && n < start + count;
              return (
                <button
                  key={n}
                  type="button"
                  title={used ? `Label ${n}: already used` : `Start at label ${n}`}
                  aria-label={`Start at label ${n}`}
                  onClick={() => setStart(n)}
                  style={{ aspectRatio: `${stock.labelW} / ${stock.labelH}` }}
                  className={cn(
                    "min-h-2.5 rounded-[2px] border transition-colors",
                    used ? "border-transparent bg-[repeating-linear-gradient(45deg,#e2e8f0_0_3px,#f8fafc_3px_6px)]" : filled ? "border-primary/50 bg-primary/70" : "border-border bg-white hover:bg-primary-soft",
                    n === start && "ring-2 ring-primary ring-offset-1",
                  )}
                />
              );
            })}
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
          {stock && <p className="basis-full text-xs text-muted-foreground">Kinus then remembers the next print starts at label {next}{next === 1 ? " of a fresh sheet" : ""}.</p>}
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
