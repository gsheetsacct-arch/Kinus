"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as XLSX from "xlsx";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { appUrl } from "@/lib/auth/app-url";
import { getActiveSession, requireDirector } from "@/lib/auth/current-user";
import { canGrantAreas, canManageRole, type AccessLevel, type CurrentUser, type StaffRole } from "@/lib/auth/permissions";
import { STAFF_ROLES } from "@/lib/labels";
import { decodeArea, loadAreaTree, type AreaValue } from "@/lib/data/areas";
import { planRows, readRows, type BulkPlanRow } from "@/lib/staff/bulk";
import { decodeText } from "@/lib/import/decode";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

const ROLES = ["owner", "director", "division_head", "head_counselor", "counselor", "scanner", "office", "logistics"] as const;
const LEVELS = ["view", "scan", "edit"] as const;
const signInRedirect = async () => `${await appUrl()}/login?next=/set-password`;

async function divisionGroupLookup() {
  const session = await getActiveSession();
  const admin = createAdminClient();
  const { data } = session ? await admin.from("divisions").select("id, group_id").eq("session_id", session.id) : { data: [] };
  const map = new Map((data ?? []).map((d) => [d.id, d.group_id]));
  return (id: string) => map.get(id) ?? null;
}

/** Checks that `me` may give this role/area/level to someone (and may touch them at all). */
async function assertCanAssign(me: CurrentUser, target: { id?: string; role?: StaffRole } | null, next: { role: StaffRole; allAreas: boolean; areas: AreaValue[] }) {
  if (target?.id === me.id) throw new Error("You can't change your own role or area. Ask another director.");
  if (target?.role && !canManageRole(me, target.role)) throw new Error(`You can't change a ${STAFF_ROLES[target.role].label.toLowerCase()}'s access.`);
  if (!canManageRole(me, next.role)) throw new Error(`You can't make someone a ${STAFF_ROLES[next.role].label.toLowerCase()}.`);
  if (!canGrantAreas(me, next.areas, next.allAreas, await divisionGroupLookup())) throw new Error("You can only give access inside your own area.");
}

async function writeAccess(userId: string, v: { role: StaffRole; level: AccessLevel; allAreas: boolean; areas: AreaValue[]; full_name?: string; phone?: string | null }) {
  const admin = createAdminClient();
  const patch: { role: StaffRole; access_level: AccessLevel; all_areas: boolean; full_name?: string; phone?: string | null } = {
    role: v.role,
    access_level: v.role === "owner" ? "edit" : v.level,
    all_areas: v.role === "owner" ? true : v.allAreas,
  };
  if (v.full_name !== undefined) patch.full_name = v.full_name;
  if (v.phone !== undefined) patch.phone = v.phone;
  const { error } = await admin.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
  const del = await admin.from("staff_scopes").delete().eq("user_id", userId);
  if (del.error) throw del.error;
  if (!v.allAreas && v.areas.length) {
    const { error: e } = await admin.from("staff_scopes").insert(v.areas.map((a) => ({ user_id: userId, ...a })));
    if (e) throw e;
  }
}

const person = z.object({
  id: z.guid().optional(),
  full_name: z.string().trim().min(1, "Enter their name."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").optional(),
  phone: z.string().trim().optional(),
  role: z.enum(ROLES, { message: "Choose a role." }),
  access_level: z.enum(LEVELS).optional(),
  all_areas: z.string().optional(),
  invite: z.string().optional(),
});

/** Adds or updates one person: details, role, where, and level — all in one go. */
export async function savePerson(fd: FormData): Promise<ActionResult> {
  const me = await requireDirector();
  try {
    const d = person.parse(Object.fromEntries(fd));
    const areas = fd.getAll("areas").map(String).map(decodeArea).filter((a): a is AreaValue => a !== null);
    const allAreas = d.all_areas === "on";
    const level = d.access_level ?? STAFF_ROLES[d.role].defaultLevel;
    if (d.role !== "owner" && !allAreas && areas.length === 0 && d.role !== "office" && d.role !== "logistics")
      return fail("Choose where they work: all of camp, or at least one camp, division or bunk.");
    const admin = createAdminClient();
    if (d.id) {
      const { data: target } = await admin.from("profiles").select("id, role").eq("id", d.id).single();
      await assertCanAssign(me, target, { role: d.role, allAreas, areas });
      await writeAccess(d.id, { role: d.role, level, allAreas, areas, full_name: d.full_name, phone: d.phone || null });
      revalidatePath("/admin/users");
      return ok("Saved.");
    }
    if (!d.email) return fail("Enter their email.");
    await assertCanAssign(me, null, { role: d.role, allAreas, areas });
    const { data: existing } = await admin.from("profiles").select("id").eq("email", d.email).maybeSingle();
    if (existing) return fail("Someone with that email already has an account. Find them in the staff list.");
    const id = await createAccount(d.email, d.full_name, d.role, d.invite === "on" ? "invite" : "none");
    await writeAccess(id, { role: d.role, level, allAreas, areas, full_name: d.full_name, phone: d.phone || null });
    revalidatePath("/admin/users");
    return ok(d.invite === "on" ? `Invitation sent to ${d.email}.` : `${d.full_name} added. Send them a sign-in link when ready.`, "/admin/users");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

async function createAccount(email: string, fullName: string, role: StaffRole, mode: "invite" | "none" | { password: string }): Promise<string> {
  const admin = createAdminClient();
  const meta = { full_name: fullName, role };
  if (mode === "invite") {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: meta, redirectTo: await signInRedirect() });
    if (error) throw new Error(/already been registered|already exists/i.test(error.message) ? "Already has an account." : error.message);
    return data.user.id;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: meta, password: typeof mode === "object" ? mode.password : undefined });
  if (error) throw new Error(/already been registered|already exists/i.test(error.message) ? "Already has an account." : error.message);
  return data.user.id;
}

// ---------------------------------------------------------------------------
// Bulk add
// ---------------------------------------------------------------------------
export type BulkPreview = { rows: (BulkPlanRow & { existingId: string | null; existingRole: StaffRole | null })[] };

export async function previewBulkAdd(fd: FormData): Promise<ActionResult & { preview?: BulkPreview }> {
  const me = await requireDirector();
  try {
    const session = await getActiveSession();
    const admin = createAdminClient();
    const tree = await loadAreaTree(admin, session?.id);
    let grid: string[][] = [];
    const file = fd.get("file");
    const text = String(fd.get("text") ?? "");
    if (file instanceof File && file.size > 0) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const wb = /\.(csv|tsv|txt)$/i.test(file.name) ? XLSX.read(decodeText(bytes).text, { type: "string", raw: true }) : XLSX.read(bytes, { type: "array" });
      grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
    } else if (text.trim()) {
      const wb = XLSX.read(text.trim(), { type: "string", raw: true, FS: text.includes("\t") ? "\t" : "," });
      grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
    } else return fail("Paste the list or choose a file.");
    const defaultRole = z.enum(ROLES).catch("counselor").parse(fd.get("default_role"));
    const rows = planRows(readRows(grid), tree, { role: defaultRole, level: "role" });
    if (!rows.length) return fail("No rows found.");
    const emails = rows.map((r) => r.email).filter(Boolean);
    const { data: existing } = await admin.from("profiles").select("id, email, role").in("email", emails.length ? emails : ["-"]);
    const lookup = await divisionGroupLookup();
    const out = rows.map((r) => {
      const ex = existing?.find((p) => p.email.toLowerCase() === r.email) ?? null;
      const errors = [...r.errors];
      if (r.role && !canManageRole(me, r.role)) errors.push(`You can't add a ${STAFF_ROLES[r.role].label.toLowerCase()}.`);
      if (ex && !canManageRole(me, ex.role)) errors.push(`Already a ${STAFF_ROLES[ex.role].label.toLowerCase()}; you can't change them.`);
      if (ex?.id === me.id) errors.push("That's you.");
      if (!canGrantAreas(me, r.areas, r.allAreas, lookup)) errors.push("Outside your own area.");
      return { ...r, errors, existingId: ex?.id ?? null, existingRole: ex?.role ?? null };
    });
    return { ok: true, preview: { rows: out } };
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export type BulkResult = { line: number; name: string; email: string; outcome: "invited" | "created" | "updated" | "failed"; detail?: string; password?: string };

export async function applyBulkAdd(rowsJson: string, mode: "invite" | "password"): Promise<ActionResult & { results?: BulkResult[] }> {
  const me = await requireDirector();
  const rows = JSON.parse(rowsJson) as BulkPreview["rows"];
  const results: BulkResult[] = [];
  for (const r of rows) {
    if (r.errors.length || !r.role) continue;
    const base = { line: r.line, name: r.name, email: r.email };
    try {
      const level = r.level ?? STAFF_ROLES[r.role].defaultLevel;
      if (r.existingId) {
        await assertCanAssign(me, { id: r.existingId, role: r.existingRole ?? undefined }, { role: r.role, allAreas: r.allAreas, areas: r.areas });
        await writeAccess(r.existingId, { role: r.role, level, allAreas: r.allAreas, areas: r.areas });
        results.push({ ...base, outcome: "updated" });
        continue;
      }
      await assertCanAssign(me, null, { role: r.role, allAreas: r.allAreas, areas: r.areas });
      const password = mode === "password" ? generatePassword() : undefined;
      const id = await createAccount(r.email, r.name, r.role, password ? { password } : "invite");
      await writeAccess(id, { role: r.role, level, allAreas: r.allAreas, areas: r.areas, full_name: r.name });
      results.push({ ...base, outcome: password ? "created" : "invited", password });
    } catch (e) {
      results.push({ ...base, outcome: "failed", detail: errorMessage(e) });
    }
  }
  revalidatePath("/admin/users");
  const n = (o: BulkResult["outcome"]) => results.filter((x) => x.outcome === o).length;
  return { ok: true, message: `${n("invited") + n("created")} added, ${n("updated")} updated${n("failed") ? `, ${n("failed")} failed` : ""}.`, results };
}

function generatePassword() {
  const words = ["camp", "bunk", "sun", "lake", "tent", "fire", "pine", "trail", "star", "canoe", "hike", "song"];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ---------------------------------------------------------------------------
// Bulk changes on the staff list
// ---------------------------------------------------------------------------
async function targets(me: CurrentUser, fd: FormData) {
  const ids = fd.getAll("ids").map(String).filter(Boolean);
  if (!ids.length) throw new Error("Select at least one person.");
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id, email, role, access_level, all_areas, full_name").in("id", ids);
  for (const p of data ?? []) {
    if (p.id === me.id) throw new Error("Your own account is selected. Leave yourself out.");
    if (!canManageRole(me, p.role)) throw new Error(`You can't change ${p.full_name}.`);
  }
  return data ?? [];
}

export async function bulkSetAccess(fd: FormData): Promise<ActionResult> {
  const me = await requireDirector();
  try {
    const people = await targets(me, fd);
    const role = fd.get("role") ? z.enum(ROLES).parse(fd.get("role")) : null;
    const level = fd.get("access_level") ? z.enum(LEVELS).parse(fd.get("access_level")) : null;
    const whereMode = String(fd.get("where_mode") ?? "keep"); // keep | replace | add
    const allAreas = fd.get("all_areas") === "on";
    const areas = fd.getAll("areas").map(String).map(decodeArea).filter((a): a is AreaValue => a !== null);
    const admin = createAdminClient();
    for (const p of people) {
      const { data: current } = await admin.from("staff_scopes").select("group_id, division_id, bunk_id").eq("user_id", p.id);
      const nextRole = role ?? p.role;
      let nextAll = p.all_areas;
      let nextAreas: AreaValue[] = current ?? [];
      if (whereMode === "replace") {
        nextAll = allAreas;
        nextAreas = areas;
      } else if (whereMode === "add") {
        nextAll = p.all_areas || allAreas;
        const key = (a: AreaValue) => `${a.group_id}|${a.division_id}|${a.bunk_id}`;
        const seen = new Set(nextAreas.map(key));
        nextAreas = [...nextAreas, ...areas.filter((a) => !seen.has(key(a)))];
      }
      await assertCanAssign(me, p, { role: nextRole, allAreas: nextAll, areas: nextAreas });
      await writeAccess(p.id, { role: nextRole, level: level ?? (role ? STAFF_ROLES[nextRole].defaultLevel : p.access_level), allAreas: nextAll, areas: nextAreas });
    }
    revalidatePath("/admin/users");
    return ok(`Updated ${people.length} ${people.length === 1 ? "person" : "people"}.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function bulkSendLinks(fd: FormData): Promise<ActionResult> {
  const me = await requireDirector();
  try {
    const people = await targets(me, fd);
    const failed: string[] = [];
    for (const p of people) {
      const r = await sendLink(p.email);
      if (r) failed.push(`${p.full_name}: ${r}`);
    }
    return failed.length ? fail(`Sent ${people.length - failed.length}. Not sent: ${failed.join("; ")}`) : ok(`Sign-in links emailed to ${people.length} ${people.length === 1 ? "person" : "people"}.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function bulkSetActive(fd: FormData): Promise<ActionResult> {
  const me = await requireDirector();
  try {
    const people = await targets(me, fd);
    const active = fd.get("active") === "true";
    const admin = createAdminClient();
    const { error } = await admin.from("profiles").update({ is_active: active }).in("id", people.map((p) => p.id));
    if (error) throw error;
    revalidatePath("/admin/users");
    return ok(`${active ? "Reactivated" : "Deactivated"} ${people.length} ${people.length === 1 ? "person" : "people"}.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

// ---------------------------------------------------------------------------
// One person: sign-in help and deactivation
// ---------------------------------------------------------------------------
async function sendLink(email: string): Promise<string | null> {
  const client = createPlainClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: await signInRedirect() } });
  return error ? error.message : null;
}

export async function sendSignInLink(fd: FormData): Promise<ActionResult> {
  await requireDirector();
  const email = String(fd.get("email"));
  const err = await sendLink(email);
  return err ? fail(err) : ok(`Sign-in link emailed to ${email}. It also lets them choose a new password.`);
}

export async function setUserPassword(fd: FormData): Promise<ActionResult> {
  const me = await requireDirector();
  const id = String(fd.get("id"));
  const pw = String(fd.get("password") ?? "");
  if (pw.length < 8) return fail("Use at least 8 characters.");
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", id).maybeSingle();
  if (!target || !canManageRole(me, target.role)) return fail("You can't set this person's password.");
  const { error } = await admin.auth.admin.updateUserById(id, { password: pw, email_confirm: true });
  if (error) return fail(error.message);
  return ok("Password set. Share it with them privately; they can change it under Your account.");
}

export async function setActive(fd: FormData): Promise<ActionResult> {
  const me = await requireDirector();
  const id = String(fd.get("id"));
  const active = fd.get("active") === "true";
  if (id === me.id) return fail("You can't deactivate yourself.");
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", id).maybeSingle();
  if (!target || !canManageRole(me, target.role)) return fail("You can't change this person.");
  const { error } = await admin.from("profiles").update({ is_active: active }).eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/admin/users");
  return ok(active ? "Account reactivated." : "Account deactivated. They can no longer see anything.");
}
