"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { appUrl } from "@/lib/auth/app-url";
import { fail, ok, type ActionResult } from "@/lib/actions/result";

const credentials = z.object({ email: z.string().email(), password: z.string().min(6), next: z.string().optional() });

export async function signInWithPassword(formData: FormData): Promise<ActionResult> {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Enter your email and password.");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return fail(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
  // only paths on this site ("//other.site" would leave it)
  const next = parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/";
  return ok(undefined, next);
}

// Implicit flow: the link itself carries the session, so it works when opened on a
// phone or another browser, unlike a PKCE link tied to the browser that asked for it.
const linkClient = () =>
  createPlainClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
  });
const tooMany = (m: string) => /rate limit|security purposes|too many/i.test(m);
// Supabase's own wording when the email has no account ("Signups not allowed for otp"):
// say the same thing as for a real account, so the page doesn't reveal who has one
const noAccount = (m: string) => /signups? not allowed|not allowed for otp|user not found|no user/i.test(m);

export async function sendMagicLink(formData: FormData): Promise<ActionResult> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) return fail("Enter a valid email.");
  const { error } = await linkClient().auth.signInWithOtp({
    email: email.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${await appUrl()}/login` },
  });
  if (error && tooMany(error.message)) return fail("Too many links requested. Wait a minute and try again.");
  if (error && !noAccount(error.message)) return fail(error.message);
  return ok("If that email has a Kinus account, a sign-in link is on its way. It works on any device.");
}

/** Forgot password: an email with a link to choose a new one (it opens “Set a new password”). */
export async function sendPasswordReset(formData: FormData): Promise<ActionResult> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) return fail("Enter a valid email.");
  const { error } = await linkClient().auth.resetPasswordForEmail(email.data, { redirectTo: `${await appUrl()}/login` });
  if (error && tooMany(error.message)) return fail("Too many emails requested. Wait a minute and try again.");
  if (error && !noAccount(error.message)) return fail(error.message);
  return ok("If that email has a Kinus account, we've sent a link to set a new password. Check your inbox.");
}

export async function setPassword(formData: FormData): Promise<ActionResult> {
  const pw = z.string().min(8, "Use at least 8 characters.").safeParse(formData.get("password"));
  if (!pw.success) return fail(pw.error.issues[0].message);
  if (formData.get("confirm") !== pw.data) return fail("Passwords do not match.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return fail(error.message);
  return ok("Password saved.", "/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
