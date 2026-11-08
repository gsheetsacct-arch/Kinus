import { smsSegments } from "@/lib/sms";

/**
 * What texting has cost, roughly (Text staff, for owners): texts sent and received through
 * Twilio, counted from Kinus' own records, and an estimate at Twilio's US rates. Twilio bills
 * per segment: a long text is several (a Hebrew or emoji text holds 70 characters, not 160).
 * Carrier fees are an average across carriers. The real bill is on Twilio (Console → Billing).
 */
export const RATES = {
  /** Twilio, per segment, sent or received (US). */
  twilio: 0.0083,
  /** Carriers' fees per segment, roughly: sent texts (registered A2P 10DLC), received ones. */
  carrierOut: 0.003,
  carrierIn: 0.001,
  /** The phone number, a month. */
  number: 1.15,
} as const;

export type UsageWindow = { texts: number; segments: number; replies: number; replySegments: number; failed: number; cost: number };
export type TextUsage = { today: UsageWindow; week: UsageWindow; all: UsageWindow; since: string | null };

type Sent = { at: string; body: string; billed: boolean };
type Received = { at: string; body: string };

const empty = (): UsageWindow => ({ texts: 0, segments: 0, replies: 0, replySegments: 0, failed: 0, cost: 0 });

/**
 * Counts per window (since the start of today in camp time, the last 7 days, everything).
 * A text Twilio took (it has a Twilio id) is billed even when it then wasn't delivered; one
 * Twilio turned away at once (no id) isn't.
 */
export function textUsage(sent: Sent[], received: Received[], todayStart: Date, now = new Date()): TextUsage {
  const weekStart = new Date(now.getTime() - 7 * 24 * 3600_000);
  const windows = { today: empty(), week: empty(), all: empty() };
  const into = (at: string) => {
    const t = new Date(at).getTime();
    return [windows.all, ...(t >= weekStart.getTime() ? [windows.week] : []), ...(t >= todayStart.getTime() ? [windows.today] : [])];
  };
  const segs = new Map<string, number>();
  const segmentsOf = (body: string) => {
    let n = segs.get(body);
    if (n === undefined) segs.set(body, (n = Math.max(1, smsSegments(body).segments)));
    return n;
  };
  for (const s of sent)
    for (const w of into(s.at)) {
      if (!s.billed) {
        w.failed += 1;
        continue;
      }
      w.texts += 1;
      w.segments += segmentsOf(s.body);
    }
  for (const r of received)
    for (const w of into(r.at)) {
      w.replies += 1;
      w.replySegments += segmentsOf(r.body);
    }
  for (const w of Object.values(windows)) w.cost = w.segments * (RATES.twilio + RATES.carrierOut) + w.replySegments * (RATES.twilio + RATES.carrierIn);
  const times = [...sent.map((s) => s.at), ...received.map((r) => r.at)].sort();
  return { ...windows, since: times[0] ?? null };
}
