"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

const profile = z.object({ full_name: z.string().trim().min(1, "Enter your name."), phone: z.string().trim().optional() });

export async function updateMyProfile(fd: FormData): Promise<ActionResult> {
  const me = await requireUser();
  if (me.checkinLogin) return fail("Check-in logins are changed on the Staff page.");
  try {
    const d = profile.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ full_name: d.full_name, phone: d.phone || null }).eq("id", me.id);
    if (error) throw error;
    revalidatePath("/", "layout");
    return ok("Saved.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function changeMyPassword(fd: FormData): Promise<ActionResult> {
  // a shared login's password is set on the Staff page (changing it here would sign the other phones out)
  if ((await requireUser()).checkinLogin) return fail("Check-in logins get a new password on the Staff page.");
  const pw = String(fd.get("password") ?? "");
  if (pw.length < 8) return fail("Use at least 8 characters.");
  if (fd.get("confirm") !== pw) return fail("The two passwords don't match.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return fail(/different from the old/i.test(error.message) ? "That's already your password. Choose a new one." : error.message);
  return ok("Password changed. Use it next time you sign in.");
}

/** How long after signing in someone may add a Face ID / fingerprint sign-in. */
const RECENT_SIGN_IN_S = 10 * 60;

/**
 * Adding a passkey needs a fresh sign-in, so a phone left unlocked (or a borrowed laptop)
 * can't quietly get a permanent way in. Read from the session's own sign-in record (amr).
 */
export async function signedInRecently(): Promise<boolean> {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const amr = (data?.claims?.amr ?? []) as ({ method: string; timestamp: number } | string)[];
  const latest = Math.max(0, ...amr.map((a) => (typeof a === "object" && a ? Number(a.timestamp) || 0 : 0)));
  return latest > 0 && Date.now() / 1000 - latest < RECENT_SIGN_IN_S;
}

/** Sign out and come back to the Face ID section after signing in again. */
export async function signInAgainForPasskey() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(`/login?next=${encodeURIComponent("/account#face-id")}`);
}
