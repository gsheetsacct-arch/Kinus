"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePhone } from "@/lib/import/mapping";
import { UPDATES_CONSENT } from "@/lib/update-signups";

export type SignUpState = { ok: boolean; message: string } | null;

const form = z.object({
  name: z.string().trim().min(2, "Your full name, please.").max(100),
  phone: z.string().trim().min(7, "Your cell number, please.").max(30),
  consent: z.literal("yes", { message: "Tick the box to agree to receive updates." }),
  website: z.string().max(0).optional(), // left empty by people; filled by bots
});

/** A sign-up from the public page (no account needed): saved with the consent as shown. */
export async function signUpForUpdates(_prev: SignUpState, data: FormData): Promise<SignUpState> {
  const parsed = form.safeParse({ name: data.get("name"), phone: data.get("phone"), consent: data.get("consent") ?? "", website: data.get("website") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  // a bot filled the hidden field: answer as if it worked
  if (parsed.data.website) return { ok: true, message: "You're signed up." };
  const e164 = parsePhone(parsed.data.phone, "US");
  if (!e164) return { ok: false, message: "That doesn't look like a phone number. Include the area code (and + and the country code if it's not a US number)." };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const admin = createAdminClient();
  // many sign-ups from one place in an hour: a script, not a staff room
  if (ip) {
    const { count } = await admin.from("update_signups").select("id", { count: "exact", head: true }).eq("ip", ip).gte("updated_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= 30) return { ok: false, message: "Too many sign-ups from here just now. Try again in an hour." };
  }
  const now = new Date().toISOString();
  const { error } = await admin.from("update_signups").upsert(
    { full_name: parsed.data.name, phone: parsed.data.phone, phone_e164: e164, consent_text: UPDATES_CONSENT, consented_at: now, ip, user_agent: h.get("user-agent")?.slice(0, 300) ?? null, updated_at: now },
    { onConflict: "phone_e164" },
  );
  if (error) return { ok: false, message: /update_signups/.test(error.message) ? "Sign-ups aren't open yet. Tell the office." : "Couldn't save that. Try again in a minute." };
  return { ok: true, message: `Thanks, ${parsed.data.name.split(" ")[0]}! You'll get updates at ${e164}.` };
}
