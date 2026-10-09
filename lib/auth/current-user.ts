import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isDirectorOrAbove, type CurrentUser } from "./permissions";

/** Loads the signed-in user's profile and scopes once per request. Null when signed out. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profileRow }, { data: scopes }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, global_role, is_active").eq("id", user.id).maybeSingle(),
    supabase.from("staff_scopes").select("id, division_id, bunk_id, scope_role, access_level").eq("user_id", user.id),
  ]);
  let profile = profileRow;
  if (!profile) profile = await healMissingProfile(user.id, user.email ?? "", (user.user_metadata ?? {}) as Record<string, string>);
  if (!profile || !profile.is_active) return null;
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.global_role,
    scopes: scopes ?? [],
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!isAdmin(u)) redirect("/?denied=admin");
  return u;
}

export async function requireDirector(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!isDirectorOrAbove(u)) redirect("/?denied=director");
  return u;
}

/** The active session (year). Null when none has been activated yet. */
export const getActiveSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("sessions").select("id, name, starts_on, ends_on").eq("is_active", true).maybeSingle();
  return data;
});

/**
 * A user that exists in auth but has no profile row (invited before the schema was
 * applied, or the trigger was skipped) gets one here, as owner if their email is the
 * configured bootstrap owner.
 */
async function healMissingProfile(id: string, email: string, meta: Record<string, string>) {
  try {
    const admin = createAdminClient();
    const { data: boot } = await admin.from("settings").select("value").eq("key", "bootstrap_owner").maybeSingle();
    const bootEmail = (boot?.value as { email?: string } | null)?.email?.toLowerCase();
    const role = bootEmail && bootEmail === email.toLowerCase() ? "owner" : ((meta.global_role as "staff") ?? "staff");
    const { data } = await admin
      .from("profiles")
      .upsert({ id, email, full_name: meta.full_name ?? email.split("@")[0], global_role: role })
      .select("id, email, full_name, global_role, is_active")
      .single();
    return data;
  } catch {
    return null;
  }
}
