"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { requireAdmin, requireDirector } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

const ROLES = ["owner", "admin", "director", "logistics", "office", "staff"] as const;

const invite = z.object({
  email: z.string().trim().toLowerCase().email(),
  full_name: z.string().trim().min(1, "Name is required"),
  global_role: z.enum(ROLES),
});

export async function inviteUser(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  try {
    const d = invite.parse(Object.fromEntries(fd));
    if (d.global_role === "owner" && me.role !== "owner") return fail("Only an owner can create owners.");
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(d.email, {
      data: { full_name: d.full_name, global_role: d.global_role },
      redirectTo: `${serverEnv().APP_URL}/auth/callback?next=/set-password`,
    });
    if (error) throw error;
    // the auth trigger created the profile; make sure name/role are what the form said
    await admin.from("profiles").update({ full_name: d.full_name, global_role: d.global_role }).eq("id", data.user.id);
    revalidatePath("/admin/users");
    return ok(`Invitation sent to ${d.email}.`, `/admin/users/${data.user.id}`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function resendInvite(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const email = String(fd.get("email"));
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: `${serverEnv().APP_URL}/auth/callback?next=/set-password` } });
  void error;
  // generateLink does not send mail; signInWithOtp does (user must already exist).
  const { error: e2 } = await admin.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${serverEnv().APP_URL}/auth/callback?next=/set-password` } });
  if (e2) return fail(e2.message);
  return ok(`Sign-in link sent to ${email}.`);
}

const profileSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  global_role: z.enum(ROLES),
});

export async function updateProfile(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  try {
    const d = profileSchema.parse(Object.fromEntries(fd));
    if (d.global_role === "owner" && me.role !== "owner") return fail("Only an owner can grant owner.");
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ full_name: d.full_name, phone: d.phone || null, global_role: d.global_role }).eq("id", d.id);
    if (error) throw error;
    revalidatePath(`/admin/users/${d.id}`);
    return ok("Saved.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function setActive(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const id = String(fd.get("id"));
  const active = fd.get("active") === "true";
  if (id === me.id) return fail("You cannot deactivate yourself.");
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", id);
  if (error) return fail(error.message);
  revalidatePath(`/admin/users/${id}`);
  return ok(active ? "Account reactivated." : "Account deactivated; they are signed out everywhere.");
}

const scope = z.object({
  user_id: z.string().uuid(),
  division_id: z.string().uuid(),
  bunk_id: z.string().uuid().optional().or(z.literal("")),
  scope_role: z.enum(["division_head", "head_counselor", "counselor", "scanner"]),
  access_level: z.enum(["view", "scan", "edit"]),
});

export async function addScope(fd: FormData): Promise<ActionResult> {
  await requireDirector();
  try {
    const d = scope.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    const { error } = await supabase.from("staff_scopes").insert({
      user_id: d.user_id,
      division_id: d.division_id,
      bunk_id: d.bunk_id || null,
      scope_role: d.scope_role,
      access_level: d.access_level,
    });
    if (error) throw error;
    revalidatePath(`/admin/users/${d.user_id}`);
    return ok("Access added.");
  } catch (e) {
    return fail(errorMessage(e).includes("duplicate") ? "They already have access to that division/bunk." : errorMessage(e));
  }
}

export async function removeScope(fd: FormData): Promise<ActionResult> {
  await requireDirector();
  const id = String(fd.get("id"));
  const userId = String(fd.get("user_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("staff_scopes").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath(`/admin/users/${userId}`);
  return ok("Access removed.");
}
