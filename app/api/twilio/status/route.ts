import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { laterStatus } from "@/lib/sms";
import { readTwilioWebhook, twilioConfig } from "@/lib/twilio";

/**
 * Twilio reports how each staff text went (sent, delivered, failed…). The address carries the
 * recipient row (?r=), so a report that arrives before the send finished saving still lands.
 */
export async function POST(request: NextRequest) {
  const config = twilioConfig();
  if (!config) return new NextResponse(null, { status: 503 });
  const params = await readTwilioWebhook(request, config);
  if (!params) return new NextResponse(null, { status: 403 });
  const status = params.MessageStatus ?? params.SmsStatus;
  const id = request.nextUrl.searchParams.get("r");
  const admin = createAdminClient();
  const row = id
    ? (await admin.from("text_broadcast_recipients").select("id, status").eq("id", id).maybeSingle()).data
    : params.MessageSid
      ? (await admin.from("text_broadcast_recipients").select("id, status").eq("twilio_sid", params.MessageSid).maybeSingle()).data
      : null;
  if (row && status && laterStatus(row.status, status)) {
    await admin
      .from("text_broadcast_recipients")
      .update({ status, twilio_sid: params.MessageSid || undefined, error_code: params.ErrorCode || null, error_message: params.ErrorCode ? (params.ErrorMessage ?? null) : null, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (status === "undelivered" || status === "failed") {
      const { data: r } = await admin.from("text_broadcast_recipients").select("broadcast_id").eq("id", row.id).single();
      if (r) {
        const { count } = await admin.from("text_broadcast_recipients").select("id", { count: "exact", head: true }).eq("broadcast_id", r.broadcast_id).in("status", ["failed", "undelivered"]);
        await admin.from("text_broadcasts").update({ failed_count: count ?? 0 }).eq("id", r.broadcast_id);
      }
    }
  }
  return new NextResponse(null, { status: 204 });
}
