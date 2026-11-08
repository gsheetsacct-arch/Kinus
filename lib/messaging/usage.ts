import { smsSegments } from "@/lib/sms";

/**
 * What texting has cost (Text staff, for owners): texts sent and received through Twilio.
 * Twilio's own billing (its Usage API) is used when it answers: that is the real bill. Kinus'
 * records give the counts and a low–high estimate either way, since carrier fees vary by carrier.
 * Twilio bills per segment: a long text is several (a Hebrew or emoji text holds 70 characters, not 160).
 */
export const RATES = {
  /** Twilio, per segment, sent or received (US, low and high). */
  twilio: [0.0079, 0.0083],
  /** Carriers' fees per segment sent (registered A2P 10DLC: AT&T ~0.002 to T-Mobile/Verizon ~0.003; this account's bill works out at ~0.0025). */
  carrierOut: [0.002, 0.003],
  /** Carriers' fees per segment received (most charge none; T-Mobile ~0.003). */
  carrierIn: [0, 0.003],
} as const;

export type Range = { min: number; max: number };
/** Twilio's bill for the window: SMS sent and received (with carrier fees), and everything (the number too). */
export type Billed = { sent: number; sentSegments: number; received: number; sms: number; total: number };
export type UsageWindow = { texts: number; segments: number; replies: number; replySegments: number; failed: number; cost: Range; billed?: Billed | null };
export type TextUsage = { today: UsageWindow; week: UsageWindow; all: UsageWindow; since: string | null };

type Sent = { at: string; body: string; billed: boolean };
type Received = { at: string; body: string };

const empty = (): UsageWindow => ({ texts: 0, segments: 0, replies: 0, replySegments: 0, failed: 0, cost: { min: 0, max: 0 } });

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
  for (const w of Object.values(windows))
    w.cost = {
      min: w.segments * (RATES.twilio[0] + RATES.carrierOut[0]) + w.replySegments * (RATES.twilio[0] + RATES.carrierIn[0]),
      max: w.segments * (RATES.twilio[1] + RATES.carrierOut[1]) + w.replySegments * (RATES.twilio[1] + RATES.carrierIn[1]),
    };
  const times = [...sent.map((s) => s.at), ...received.map((r) => r.at)].sort();
  return { ...windows, since: times[0] ?? null };
}

/** Twilio usage records (one category), as its Usage API lists them. */
export type UsageRecord = { category: string; count: string; usage: string; price: string | null };

/** Twilio's bill from its usage records: SMS sent and received, their carrier fees, and the total. */
export function billedFrom(records: UsageRecord[]): Billed {
  const of = (c: string) => records.filter((r) => r.category === c);
  const sum = (rs: UsageRecord[], k: "count" | "usage" | "price") => rs.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const out = of("sms-outbound");
  const inbound = of("sms-inbound");
  return {
    sent: sum(out, "count"),
    sentSegments: sum(out, "usage"),
    received: sum(inbound, "count"),
    // the separate parts (not "sms", which may already hold some of them)
    sms: Math.abs(sum(out, "price")) + Math.abs(sum(inbound, "price")) + Math.abs(sum(of("sms-messages-carrierfees"), "price")),
    total: Math.abs(sum(of("totalprice"), "price")),
  };
}
