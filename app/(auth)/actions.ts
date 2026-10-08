"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { fail, ok, type ActionResult } from "@/lib/actions/result";

const credentials = z.object({ email: z.string().email(), password: z.string().min(6), next: z.string().optional() });

export async function signInWithPassword(formData: FormData): Promise<ActionResult> {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Enter your email and password.");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return fail(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
  const next = parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : "/";
  return ok(undefined, next);
}

export async function sendMagicLink(formData: FormData): Promise<ActionResult> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) return fail("Enter a valid email.");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${serverEnv().APP_URL}/auth/callback` },
  });
  if (error) return fail(error.message);
  return ok("Check your email for a sign-in link.");
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
