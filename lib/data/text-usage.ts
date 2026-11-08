import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { startOfCampDay } from "@/lib/time";
import { textUsage, type TextUsage } from "@/lib/messaging/usage";

/** Texts sent and received through Twilio, from Kinus' records, with the estimated cost (owners only: the page checks). */
export async function loadTextUsage(): Promise<TextUsage> {
  const admin = createAdminClient();
  const [broadcasts, recipients, replies] = await Promise.all([
    fetchAll<{ id: string; body: string; created_at: string }>((from, to) => admin.from("text_broadcasts").select("id, body, created_at").order("id").range(from, to)),
    fetchAll<{ broadcast_id: string; twilio_sid: string | null }>((from, to) => admin.from("text_broadcast_recipients").select("broadcast_id, twilio_sid").order("id").range(from, to)),
    fetchAll<{ body: string; received_at: string }>((from, to) => admin.from("text_replies").select("body, received_at").order("id").range(from, to)),
  ]);
  const byId = new Map(broadcasts.map((b) => [b.id, b]));
  const sent = recipients.flatMap((r) => {
    const b = byId.get(r.broadcast_id);
    return b ? [{ at: b.created_at, body: b.body, billed: Boolean(r.twilio_sid) }] : [];
  });
  return textUsage(
    sent,
    replies.map((r) => ({ at: r.received_at, body: r.body })),
    new Date(startOfCampDay()),
  );
}
