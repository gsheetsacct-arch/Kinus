import type { Range, TextUsage, UsageWindow } from "@/lib/messaging/usage";

const money = (n: number) => "$" + (n < 100 ? n.toFixed(2) : n.toFixed(0));
const range = (r: Range) => (money(r.min) === money(r.max) ? money(r.min) : `${money(r.min)}–${money(r.max)}`);
const num = (n: number) => n.toLocaleString("en-US");

function Tile({ title, w }: { title: string; w: UsageWindow }) {
  const b = w.billed;
  return (
    <div className="min-w-36 shrink-0 snap-start rounded-lg border bg-card px-3 py-2 text-xs">
      <div className="font-medium text-muted-foreground">{title}</div>
      {b ? (
        <div className="mt-0.5 text-base font-semibold tabular-nums" title="Twilio's bill for texts (with carrier fees)">
          {money(b.sms)}
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">Twilio</span>
        </div>
      ) : (
        <div className="mt-0.5 text-base font-semibold tabular-nums" title="Estimated, low to high (Twilio didn't answer)">
          {range(w.cost)}
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">est.</span>
        </div>
      )}
      <div className="mt-1 space-y-0.5 tabular-nums text-muted-foreground">
        <div>
          <span className="text-foreground">{num(b ? b.sent : w.texts)}</span> sent · {num(b ? b.sentSegments : w.segments)} seg.
        </div>
        <div>
          <span className="text-foreground">{num(b ? b.received : w.replies)}</span> received
        </div>
        {b && b.total > b.sms && <div title="Everything on the Twilio account, the phone number too">All Twilio {money(b.total)}</div>}
      </div>
    </div>
  );
}

/** Texting so far and what it costs (owners only): Twilio's bill when it answers, else Kinus' estimate. */
export function TextUsageCard({ usage }: { usage: TextUsage }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Texting usage</h2>
        <span className="text-xs text-muted-foreground">Owners only · from Twilio when it answers, else estimated</span>
      </div>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        <Tile title="Today" w={usage.today} />
        <Tile title="Last 7 days" w={usage.week} />
        <Tile title="All time" w={usage.all} />
      </div>
    </div>
  );
}
