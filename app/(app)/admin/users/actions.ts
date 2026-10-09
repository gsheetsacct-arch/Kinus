"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/auth/app-url";
import { requireAdmin, requireDirector } from "@/lib/auth/current-user";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

const ROLES = ["owner", "admin", "director", "logistics", "office", "staff"] as const;
const redirectTo = async () => `${await appUrl()}/login?next=/set-password`;

const invite = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  full_name: z.string().trim().min(1, "Enter their name."),
  global_role: z.enum(ROLES, { message: "Choose a role." }),
});

export async function inviteUser(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  try {
    const d = invite.parse(Object.fromEntries(fd));
    if (d.global_role === "owner" && me.role !== "owner") return fail("Only an owner can make someone an owner.");
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(d.email, { data: { full_name: d.full_name, global_role: d.global_role }, redirectTo: await redirectTo() });
    if (error) {
      if (/already been registered|already exists/i.test(error.message)) return fail("Someone with that email already has an account. Find them in the list.");
      throw error;
    }
    await admin.from("profiles").upsert({ id: data.user.id, email: d.email, full_name: d.full_name, global_role: d.global_role });
    revalidatePath("/admin/users");
    return ok(`Invitation sent to ${d.email}.`, `/admin/users/${data.user.id}`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function sendSignInLink(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const email = String(fd.get("email"));
  const admin = createAdminClient();
  const { error } = await admin.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: await redirectTo() } });
  if (error) return fail(error.message);
  return ok(`Sign-in link emailed to ${email}. It lets them choose a new password.`);
}

export async function setUserPassword(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const id = String(fd.get("id"));
  const pw = String(fd.get("password") ?? "");
  if (pw.length < 8) return fail("Use at least 8 characters.");
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("global_role").eq("id", id).maybeSingle();
  if (target?.global_role === "owner" && me.role !== "owner") return fail("Only an owner can set an owner's password.");
  const { error } = await admin.auth.admin.updateUserById(id, { password: pw, email_confirm: true });
  if (error) return fail(error.message);
  return ok("Password set. Share it with them privately; they can change it under Your account.");
}

const profileSchema = z.object({ id: z.guid(), full_name: z.string().trim().min(1, "Enter their name."), phone: z.string().trim().optional() });

export async function updateProfile(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const d = profileSchema.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ full_name: d.full_name, phone: d.phone || null }).eq("id", d.id);
    if (error) throw error;
    revalidatePath(`/admin/users/${d.id}`);
    return ok("Saved.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function updateRole(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const id = String(fd.get("id"));
  const role = z.enum(ROLES).safeParse(fd.get("global_role"));
  if (!role.success) return fail("Choose a role.");
  if (id === me.id && role.data !== me.role) return fail("You can't change your own role. Ask another admin.");
  if (role.data === "owner" && me.role !== "owner") return fail("Only an owner can make someone an owner.");
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ global_role: role.data }).eq("id", id);
  if (error) return fail(error.message);
  revalidatePath(`/admin/users/${id}`);
  return ok("Role updated.");
}

export async function setActive(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const id = String(fd.get("id"));
  const active = fd.get("active") === "true";
  if (id === me.id) return fail("You can't deactivate yourself.");
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", id);
  if (error) return fail(error.message);
  revalidatePath(`/admin/users/${id}`);
  return ok(active ? "Account reactivated." : "Account deactivated. They can no longer see anything.");
}

const scope = z.object({
  user_id: z.guid(),
  division_id: z.guid({ message: "Choose a division." }),
  bunk_id: z.guid().optional().or(z.literal("")),
  scope_role: z.enum(["division_head", "head_counselor", "counselor", "scanner"], { message: "Choose what they are there." }),
  access_level: z.enum(["view", "scan", "edit"], { message: "Choose what they may do." }),
});

export async function addScope(fd: FormData): Promise<ActionResult> {
  await requireDirector();
  try {
    const d = scope.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    const { error } = await supabase.from("staff_scopes").insert({ user_id: d.user_id, division_id: d.division_id, bunk_id: d.bunk_id || null, scope_role: d.scope_role, access_level: d.access_level });
    if (error) throw error;
    revalidatePath(`/admin/users/${d.user_id}`);
    return ok("Access added.");
  } catch (e) {
    return fail(errorMessage(e).includes("duplicate") ? "They already have access to that division or bunk. Remove it first to change it." : errorMessage(e));
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
