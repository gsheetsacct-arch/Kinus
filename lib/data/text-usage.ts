import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { startOfCampDay } from "@/lib/time";
import { twilioConfig, type TwilioConfig } from "@/lib/twilio";
import { billedFrom, textUsage, type Billed, type TextUsage, type UsageRecord } from "@/lib/messaging/usage";

const CATEGORIES = ["sms-outbound", "sms-inbound", "sms-messages-carrierfees", "totalprice"];

/** Twilio's usage records for one window and category (its Usage API), or null when it doesn't answer in time. */
async function records(config: TwilioConfig, window: "Today" | "AllTime" | { start: string; end: string }, category: string): Promise<UsageRecord[] | null> {
  const base = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Usage/Records`;
  const qs = new URLSearchParams({ Category: category, ...(typeof window === "string" ? {} : { StartDate: window.start, EndDate: window.end }) });
  const url = `${base}${typeof window === "string" ? `/${window}` : ""}.json?${qs}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { usage_records?: UsageRecord[] };
    return body.usage_records ?? [];
  } catch {
    return null;
  }
}

/** Twilio's bill for a window (all four categories), or null when any of it couldn't be read. */
async function billed(config: TwilioConfig, window: Parameters<typeof records>[1]): Promise<Billed | null> {
  const all = await Promise.all(CATEGORIES.map((c) => records(config, window, c)));
  return all.some((r) => r === null) ? null : billedFrom(all.flat() as UsageRecord[]);
}

/**
 * Texts sent and received through Twilio, from Kinus' records (counts and a low–high estimate),
 * with Twilio's own bill when it answers (owners only: the page checks).
 */
export async function loadTextUsage(): Promise<TextUsage> {
  const admin = createAdminClient();
  const config = twilioConfig();
  // Twilio's days are UTC: "today" and the last 7 days by its calendar
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const [broadcasts, recipients, replies, today, week, all] = await Promise.all([
    fetchAll<{ id: string; body: string; created_at: string }>((from, to) => admin.from("text_broadcasts").select("id, body, created_at").order("id").range(from, to)),
    fetchAll<{ broadcast_id: string; twilio_sid: string | null }>((from, to) => admin.from("text_broadcast_recipients").select("broadcast_id, twilio_sid").order("id").range(from, to)),
    fetchAll<{ body: string; received_at: string }>((from, to) => admin.from("text_replies").select("body, received_at").order("id").range(from, to)),
    config ? billed(config, "Today") : null,
    config ? billed(config, { start: day(new Date(now.getTime() - 6 * 24 * 3600_000)), end: day(now) }) : null,
    config ? billed(config, "AllTime") : null,
  ]);
  const byId = new Map(broadcasts.map((b) => [b.id, b]));
  const sent = recipients.flatMap((r) => {
    const b = byId.get(r.broadcast_id);
    return b ? [{ at: b.created_at, body: b.body, billed: Boolean(r.twilio_sid) }] : [];
  });
  const usage = textUsage(
    sent,
    replies.map((r) => ({ at: r.received_at, body: r.body })),
    new Date(startOfCampDay()),
    now,
  );
  usage.today.billed = today;
  usage.week.billed = week;
  usage.all.billed = all;
  return usage;
}
