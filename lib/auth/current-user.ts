import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isDirector, type CurrentUser } from "./permissions";

/** Why a signed-in person can't use the app (shown instead of sending them back to sign-in). */
export type AccountProblem = "database" | "inactive" | "no_profile";
type Account = { user: CurrentUser; problem?: never } | { user: null; problem: AccountProblem | "signed_out" };

/** Loads the signed-in user's profile and areas once per request. */
const loadAccount = cache(async (): Promise<Account> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, problem: "signed_out" };
  const [{ data: profileRow, error: profileError }, { data: areas, error: areasError }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role, access_level, all_areas, is_active").eq("id", user.id).maybeSingle(),
    supabase.from("staff_scopes").select("id, group_id, division_id, bunk_id").eq("user_id", user.id),
  ]);
  // a column or table the app expects is missing: the database is behind the app
  if (profileError || areasError) {
    console.error("Loading the signed-in profile failed", profileError ?? areasError);
    return { user: null, problem: "database" };
  }
  let profile = profileRow;
  if (!profile) profile = await healMissingProfile(user.id, user.email ?? "", (user.user_metadata ?? {}) as Record<string, string>);
  if (!profile) return { user: null, problem: "no_profile" };
  if (!profile.is_active) return { user: null, problem: "inactive" };
  const rows = areas ?? [];
  const groupIds = rows.map((a) => a.group_id).filter((x): x is string => Boolean(x));
  const grouped = groupIds.length ? ((await supabase.from("divisions").select("id, group_id").in("group_id", groupIds)).data ?? []) : [];
  const coverage = [
    ...rows.filter((a) => a.division_id).map((a) => ({ division_id: a.division_id!, bunk_id: a.bunk_id })),
    ...grouped.map((d) => ({ division_id: d.id, bunk_id: null })),
  ];
  return {
    user: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      level: profile.access_level,
      allAreas: profile.all_areas,
      areas: rows,
      coverage,
    },
  };
});

/** The signed-in user, or null when signed out or their account can't be used. */
export const getCurrentUser = async (): Promise<CurrentUser | null> => (await loadAccount()).user;

/** What stops a signed-in person from using the app, if anything. */
export const getAccountProblem = async (): Promise<AccountProblem | null> => {
  const a = await loadAccount();
  return a.user || a.problem === "signed_out" ? null : a.problem;
};

export async function requireUser(): Promise<CurrentUser> {
  const a = await loadAccount();
  if (a.user) return a.user;
  // Signed in but unusable: explain, never bounce to /login (which forwards signed-in people back here).
  if (a.problem !== "signed_out") redirect(`/no-access?reason=${a.problem}`);
  redirect("/login");
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
