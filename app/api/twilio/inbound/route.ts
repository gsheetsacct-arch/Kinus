import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { optKeyword } from "@/lib/sms";
import { readTwilioWebhook, twilioConfig } from "@/lib/twilio";

const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const twiml = (xml: string, status = 200) => new NextResponse(xml, { status, headers: { "Content-Type": "text/xml" } });

/**
 * Texts staff send back to the camp number. STOP (and the other opt-out words) keeps Kinus from
 * texting them again; START undoes it. Twilio itself sends the "you're unsubscribed" reply and
 * answers HELP (Messaging Service → Opt-out management), so nothing is said back from here.
 * Anything else is a reply: kept with the text it answers (Text staff shows it there).
 */
export async function POST(request: NextRequest) {
  const config = twilioConfig();
  if (!config) return twiml(EMPTY, 503);
  const params = await readTwilioWebhook(request, config);
  if (!params) return twiml(EMPTY, 403);
  // Twilio's own opt-out handling says which it was; the words themselves otherwise
  const kind = params.OptOutType ? params.OptOutType.toLowerCase() : optKeyword(params.Body ?? "");
  const from = params.From;
  if (from && (kind === "stop" || kind === "start")) {
    const admin = createAdminClient();
    if (kind === "stop") await admin.from("text_opt_outs").upsert({ phone_e164: from, opted_out_at: new Date().toISOString() }, { onConflict: "phone_e164" });
    else await admin.from("text_opt_outs").delete().eq("phone_e164", from);
  }
  if (from && !kind && (params.Body ?? "").trim()) await keepReply(from, params.Body!.trim(), params.MessageSid ?? null).catch(() => undefined);
  return twiml(EMPTY);
}

// a reply answers the latest text sent to that number within the week before
const REPLY_WINDOW_MS = 7 * 24 * 3600_000;

async function keepReply(from: string, body: string, sid: string | null) {
  const admin = createAdminClient();
  const { data: sentTo } = await admin
    .from("text_broadcast_recipients")
    .select("broadcast_id, profile_id, name, text_broadcasts!inner(created_at)")
    .eq("phone_e164", from)
    .gte("text_broadcasts.created_at", new Date(Date.now() - REPLY_WINDOW_MS).toISOString())
    .limit(50);
  const latest = (sentTo ?? [])
    .map((r) => ({ ...r, at: (r.text_broadcasts as unknown as { created_at: string }).created_at }))
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  // who it is, when it answers nothing: a sign-up for updates
  const name = latest?.name ?? (await admin.from("update_signups").select("full_name").eq("phone_e164", from).maybeSingle()).data?.full_name ?? null;
  const row = { broadcast_id: latest?.broadcast_id ?? null, profile_id: latest?.profile_id ?? null, name, phone_e164: from, body: body.slice(0, 1600), twilio_sid: sid };
  // Twilio may call twice for one text: once is kept
  await (sid ? admin.from("text_replies").upsert(row, { onConflict: "twilio_sid", ignoreDuplicates: true }) : admin.from("text_replies").insert(row));
}
