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
  return twiml(EMPTY);
}
