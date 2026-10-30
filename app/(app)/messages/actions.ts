"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { canTextEveryone, canTextStaff, textableDivisionIds } from "@/lib/auth/permissions";
import { appUrl } from "@/lib/auth/app-url";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { loadAreaTree } from "@/lib/data/areas";
import { loadTextRecipients } from "@/lib/data/text-recipients";
import { pickRecipients, textPrefix } from "@/lib/sms";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms, TwilioError, twilioConfig } from "@/lib/twilio";

const input = z.object({
  body: z.string().trim().min(1, "Write the message first.").max(1600, "That's too long for a text (1,600 characters at most)."),
  // null = everyone
  divisionIds: z.array(z.guid()).min(1, "Pick at least one division.").nullable(),
});

// Twilio: "Attempt to send to unsubscribed recipient" (they replied STOP to this sender)
const UNSUBSCRIBED = "21610";

/** Texts the staff of the chosen divisions (or everyone), one message per number, through Twilio. */
export async function sendText(raw: { body: string; divisionIds: string[] | null }): Promise<ActionResult> {
  const me = await requireUser();
  if (!canTextStaff(me)) return fail("Only directors, division heads and head counselors can text staff.");
  const config = twilioConfig();
  if (!config) return fail("Texting isn't set up yet: Twilio's details need adding in Vercel.");
  const parsed = input.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the message and try again.");
  const { divisionIds } = parsed.data;
  // the camp and the sender's role go first ("Kinus Tzeirei Hashluchim - HC: …"), as registered with the carriers
  const body = textPrefix(me.role) + parsed.data.body;
  if (body.length > 1600) return fail("That's too long for a text (1,600 characters at most, with the name in front).");
  if (divisionIds === null && !canTextEveryone(me)) return fail("Only directors over all of camp can text everyone.");
  const allowed = textableDivisionIds(me);
  if (divisionIds && allowed && divisionIds.some((d) => !allowed.includes(d))) return fail("You can only text the staff of your own divisions.");

  try {
    const admin = createAdminClient();
    const session = await getActiveSession();
    const tree = await loadAreaTree(admin, session?.id);
    if (divisionIds && divisionIds.some((d) => !tree.divisions.some((x) => x.id === d))) return fail("One of those divisions isn't in this session any more. Reload the page.");
    // the same text twice in a row is a double tap, not a second message
    const { count: repeats } = await admin
      .from("text_broadcasts")
      .select("id", { count: "exact", head: true })
      .eq("sent_by", me.id)
      .eq("body", body)
      .gte("created_at", new Date(Date.now() - 2 * 60_000).toISOString());
    if (repeats) return fail("You sent this exact text a moment ago. Change it if you mean to send it again.");

    const { to } = pickRecipients(await loadTextRecipients(admin, tree), divisionIds);
    if (!to.length) return fail("Nobody there has a phone number to text yet.");
    const names = divisionIds ? tree.divisions.filter((d) => divisionIds.includes(d.id)).map((d) => d.name) : [];
    const { data: broadcast, error } = await admin
      .from("text_broadcasts")
      .insert({ session_id: session?.id ?? null, sent_by: me.id, sender_name: me.fullName, body, division_ids: divisionIds ?? [], audience: divisionIds ? names.join(", ") : "Everyone", recipient_count: to.length })
      .select("id")
      .single();
    if (error) throw error;
    const { data: rows, error: rowsError } = await admin
      .from("text_broadcast_recipients")
      .insert(to.map((r) => ({ broadcast_id: broadcast.id, profile_id: r.profileId, name: r.name, phone_e164: r.phone! })))
      .select("id, phone_e164");
    if (rowsError) throw rowsError;

    // Twilio reports delivery to this address (it has to be public: not on a laptop)
    const base = await appUrl();
    const callback = base.startsWith("https://") ? `${base}/api/twilio/status` : null;
    let failed = 0;
    const queue = [...(rows ?? [])];
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        try {
          const sent = await sendSms(config, { to: r.phone_e164, body, statusCallback: callback ? `${callback}?r=${r.id}` : undefined });
          await admin.from("text_broadcast_recipients").update({ twilio_sid: sent.sid }).eq("id", r.id);
        } catch (e) {
          failed++;
          const code = e instanceof TwilioError ? e.code : null;
          await admin.from("text_broadcast_recipients").update({ status: "failed", error_code: code, error_message: errorMessage(e).slice(0, 300), updated_at: new Date().toISOString() }).eq("id", r.id);
          if (code === UNSUBSCRIBED) await admin.from("text_opt_outs").upsert({ phone_e164: r.phone_e164 }, { onConflict: "phone_e164" });
        }
      }
    };
    // a few at a time: quick for a few hundred staff, well inside Twilio's limits
    await Promise.all(Array.from({ length: 8 }, worker));
    if (failed) await admin.from("text_broadcasts").update({ failed_count: failed }).eq("id", broadcast.id);
    revalidatePath("/messages");
    const sent = to.length - failed;
    if (!sent) return fail(`None of the ${to.length} texts could be sent. Open the message below to see why.`);
    return ok(`Sent to ${sent} ${sent === 1 ? "person" : "people"}${failed ? ` (${failed} couldn't be sent)` : ""}.`, `/messages/${broadcast.id}`);
  } catch (e) {
    return fail(/text_broadcast/.test(errorMessage(e)) ? "Texting needs a database update first (migration 0039)." : errorMessage(e));
  }
}
