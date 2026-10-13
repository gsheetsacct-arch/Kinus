import "server-only";
import { randomBytes } from "node:crypto";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/auth/app-url";
import type { LoginKind } from "./login-kinds";

/** The domain for stand-in addresses: this site's own (never a mailbox anyone reads). */
export async function accountDomain(): Promise<string> {
  const host = new URL(await appUrl()).hostname;
  return host.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(host) ? host : "kinus.app";
}

export const placeholderEmail = async () => `no-email.${randomBytes(5).toString("hex")}@${await accountDomain()}`;
export const checkinEmail = async (name: string) => `checkin.${name}@${await accountDomain()}`;

export { generatePassword } from "./login-kinds";

/**
 * Sets how someone signs in. Listed-only people have their sign-in blocked at Supabase
 * (no link, password or Face ID works), so they only ever appear in lists.
 */
export async function setLoginKind(userId: string, kind: LoginKind) {
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ login: kind }).eq("id", userId);
  if (error) throw error;
  const ban = await admin.auth.admin.updateUserById(userId, { ban_duration: kind === "none" ? "876000h" : "none" });
  if (ban.error && !/not found/i.test(ban.error.message)) throw ban.error;
}

/**
 * Emails someone a way in. A person who never accepted their invitation isn't confirmed yet,
 * and Supabase treats a sign-in link for them as a new sign-up (refused once sign-ups are
 * off: "Signups not allowed"), so they get their invitation again instead, with a fresh link.
 * Everyone else gets a sign-in link. Returns Supabase's error, if any.
 */
export async function emailWayIn(email: string, linkRedirect: string): Promise<{ sent: "invite" | "link"; error: string | null }> {
  const admin = createAdminClient();
  const { data: person } = await admin.from("profiles").select("id").eq("email", email.trim().toLowerCase()).maybeSingle();
  if (person) {
    const { data } = await admin.auth.admin.getUserById(person.id);
    if (data.user && !data.user.email_confirmed_at) {
      const { error } = await admin.auth.admin.inviteUserByEmail(data.user.email ?? email, { redirectTo: `${await appUrl()}/login?next=/set-password` });
      return { sent: "invite", error: error?.message ?? null };
    }
  }
  const client = createPlainClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: linkRedirect } });
  return { sent: "link", error: error?.message ?? null };
}
