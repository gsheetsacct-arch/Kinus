import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isDirector, type CurrentUser } from "./permissions";

/** Loads the signed-in user's profile and areas once per request. Null when signed out. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profileRow }, { data: areas }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role, access_level, all_areas, is_active").eq("id", user.id).maybeSingle(),
    supabase.from("staff_scopes").select("id, group_id, division_id, bunk_id").eq("user_id", user.id),
  ]);
  let profile = profileRow;
  if (!profile) profile = await healMissingProfile(user.id, user.email ?? "", (user.user_metadata ?? {}) as Record<string, string>);
  if (!profile || !profile.is_active) return null;
  const rows = areas ?? [];
  const groupIds = rows.map((a) => a.group_id).filter((x): x is string => Boolean(x));
  const grouped = groupIds.length ? ((await supabase.from("divisions").select("id, group_id").in("group_id", groupIds)).data ?? []) : [];
  const coverage = [
    ...rows.filter((a) => a.division_id).map((a) => ({ division_id: a.division_id!, bunk_id: a.bunk_id })),
    ...grouped.map((d) => ({ division_id: d.id, bunk_id: null })),
  ];
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    level: profile.access_level,
    allAreas: profile.all_areas,
    areas: rows,
    coverage,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** Camp-wide setup: owner, or a director over all of camp. */
export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!isAdmin(u)) redirect("/?denied=admin");
  return u;
}

/** Any director (their own area) or owner. */
export async function requireDirector(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!isDirector(u)) redirect("/?denied=director");
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
 * applied) gets one here, as owner if their email is the configured bootstrap owner.
 */
async function healMissingProfile(id: string, email: string, meta: Record<string, string>) {
  try {
    const admin = createAdminClient();
    const { data: boot } = await admin.from("settings").select("value").eq("key", "bootstrap_owner").maybeSingle();
    const bootEmail = (boot?.value as { email?: string } | null)?.email?.toLowerCase();
    const owner = Boolean(bootEmail && bootEmail === email.toLowerCase());
    const { data } = await admin
      .from("profiles")
      .upsert({ id, email, full_name: meta.full_name ?? email.split("@")[0], role: owner ? "owner" : "counselor", all_areas: owner, access_level: owner ? "edit" : "scan" })
      .select("id, email, full_name, role, access_level, all_areas, is_active")
      .single();
    return data;
  } catch {
    return null;
  }
}
