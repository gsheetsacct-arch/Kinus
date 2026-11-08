import { Section } from "@/components/section";
import { RATES, type TextUsage, type UsageWindow } from "@/lib/messaging/usage";
import { formatWhen } from "@/lib/utils";

const money = (n: number) => "$" + (n < 10 ? n.toFixed(2) : n.toFixed(0));
const num = (n: number) => n.toLocaleString("en-US");

function Column({ title, w }: { title: string; w: UsageWindow }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{money(w.cost)}</div>
      <dl className="mt-2 space-y-0.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Sent</dt>
          <dd className="tabular-nums">
            {num(w.texts)} <span className="text-muted-foreground">({num(w.segments)} segments)</span>
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Received</dt>
          <dd className="tabular-nums">
            {num(w.replies)} <span className="text-muted-foreground">({num(w.replySegments)} segments)</span>
          </dd>
        </div>
        {w.failed > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Not sent</dt>
            <dd className="tabular-nums">{num(w.failed)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/** Texting so far and what it costs, roughly (owners only). */
export function TextUsageCard({ usage }: { usage: TextUsage }) {
  return (
    <Section
      title="Texting usage (owners only)"
      description={
        <>
          Texts sent and received through Twilio, from Kinus&apos; records{usage.since ? ` since ${formatWhen(usage.since)}` : ""}, with an estimated cost: {"$" + RATES.twilio} a segment (Twilio) plus about {"$" + RATES.carrierOut} for each sent and {"$" + RATES.carrierIn} for each received (carrier fees). A long text counts as several segments; a Hebrew text holds 70 characters, not 160. Not included: the phone number, about {"$" + RATES.number} a month. The real bill is on Twilio: Console → Billing.
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Column title="Today" w={usage.today} />
        <Column title="Last 7 days" w={usage.week} />
        <Column title="All time" w={usage.all} />
      </div>
    </Section>
  );
}
