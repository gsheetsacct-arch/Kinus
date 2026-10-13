"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/auth/app-url";
import { getActiveSession, requireStaffManager } from "@/lib/auth/current-user";
import { canGrantAreas, canManageRole, isAdmin, type AccessLevel, type CurrentUser, type StaffRole } from "@/lib/auth/permissions";
import { STAFF_ROLES } from "@/lib/labels";
import { decodeArea, grantableTree, loadAreaTree, type AreaValue } from "@/lib/data/areas";
import { planRows, readRows, type BulkPlanRow } from "@/lib/staff/bulk";
import { decodeText } from "@/lib/import/decode";
import { normalizeName } from "@/lib/import/normalize";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { checkinEmail, emailWayIn, generatePassword, placeholderEmail, setLoginKind } from "@/lib/staff/accounts";
import { checkinLoginProblem, checkinName, isPlaceholderEmail, type LoginKind } from "@/lib/staff/login-kinds";

const ROLES = ["owner", "director", "division_head", "head_counselor", "counselor", "scanner", "office", "logistics"] as const;
const signInRedirect = async () => `${await appUrl()}/login?next=/set-password`;

/** Roles removed on Staff → Roles aren't given to anyone new. */
async function removedRoles(): Promise<Set<StaffRole>> {
  const { data } = await createAdminClient().from("role_access").select("role").eq("enabled", false);
  return new Set((data ?? []).map((r) => r.role));
}
const notInUse = (role: StaffRole) => `${STAFF_ROLES[role].label} isn't a role at your camp. Bring it back under Staff → Roles first.`;

async function divisionGroupLookup() {
  const session = await getActiveSession();
  const admin = createAdminClient();
  const { data } = session ? await admin.from("divisions").select("id, group_id").eq("session_id", session.id) : { data: [] };
  const map = new Map((data ?? []).map((d) => [d.id, d.group_id]));
  return (id: string) => map.get(id) ?? null;
}

/**
 * Whether `me` may manage these people at all: their role ranks below mine, and (for a
 * director of part of camp) everything they look after is inside my area. Directors over
 * all of camp and owners manage anyone below them.
 */
async function assertCanManage(me: CurrentUser, ids: string[]): Promise<{ id: string; email: string; role: StaffRole; access_level: AccessLevel; all_areas: boolean; full_name: string }[]> {
  const admin = createAdminClient();
  const [{ data: people }, { data: areas }] = await Promise.all([
    admin.from("profiles").select("id, email, role, access_level, all_areas, full_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    admin.from("staff_scopes").select("user_id, group_id, division_id, bunk_id").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const lookup = isAdmin(me) ? null : await divisionGroupLookup();
  for (const p of people ?? []) {
    if (!canManageRole(me, p.role)) throw new Error(`You can't change ${p.full_name}.`);
    if (!lookup) continue;
    const theirs = (areas ?? []).filter((a) => a.user_id === p.id).map(({ group_id, division_id, bunk_id }) => ({ group_id, division_id, bunk_id }));
    // someone over all of camp, or not placed anywhere yet, isn't inside an area director's part
    if (p.all_areas || !theirs.length || !canGrantAreas(me, theirs, false, lookup)) throw new Error(`${p.full_name} works outside your area. Ask a director over all of camp.`);
  }
  return people ?? [];
}

/** Checks that `me` may give this role/area/level to someone (and may touch them at all). */
async function assertCanAssign(me: CurrentUser, target: { id?: string; role?: StaffRole } | null, next: { role: StaffRole; allAreas: boolean; areas: AreaValue[] }) {
  if (target?.id === me.id) throw new Error("You can't change your own role or area. Ask a director.");
  if (target?.role && !canManageRole(me, target.role)) throw new Error(`You can't change a ${STAFF_ROLES[target.role].label.toLowerCase()}'s access.`);
  if (!canManageRole(me, next.role)) throw new Error(`You can't make someone a ${STAFF_ROLES[next.role].label.toLowerCase()}.`);
  if (next.role !== target?.role && (await removedRoles()).has(next.role)) throw new Error(notInUse(next.role));
  if (!canGrantAreas(me, next.areas, next.allAreas, await divisionGroupLookup())) throw new Error("You can only give access inside your own area.");
}

/** Role and where. What they can do follows from the role (Staff → Roles; set by the database). */
async function writeAccess(userId: string, v: { role: StaffRole; allAreas: boolean; areas: AreaValue[]; full_name?: string; phone?: string | null; title?: string | null }) {
  const admin = createAdminClient();
  const patch: { role: StaffRole; all_areas: boolean; full_name?: string; phone?: string | null; title?: string | null } = {
    role: v.role,
    all_areas: v.role === "owner" ? true : v.allAreas,
  };
  if (v.full_name !== undefined) patch.full_name = v.full_name;
  if (v.phone !== undefined) patch.phone = v.phone;
  if (v.title !== undefined) patch.title = v.title;
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
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  title: z.string().trim().max(80, "Keep the position under 80 characters.").optional(),
  role: z.enum(ROLES, { message: "Choose a role." }),
  all_areas: z.string().optional(),
  invite: z.string().optional(),
  /** "none": listed only (phone book, bunk), can't sign in. */
  login: z.enum(["personal", "none"]).optional(),
});

/** Adds or updates one person: details, role, where, and level — all in one go. */
export async function savePerson(fd: FormData): Promise<ActionResult> {
  const me = await requireStaffManager();
  try {
    const d = person.parse(Object.fromEntries(fd));
    const areas = fd.getAll("areas").map(String).map(decodeArea).filter((a): a is AreaValue => a !== null);
    const allAreas = d.all_areas === "on";
    if (d.role !== "owner" && !allAreas && areas.length === 0 && d.role !== "office" && d.role !== "logistics")
      return fail("Choose where they work: all of camp, or at least one camp, division or bunk.");
    const admin = createAdminClient();
    if (d.id) {
      await assertCanManage(me, [d.id]);
      const { data: target } = await admin.from("profiles").select("id, role, email, login").eq("id", d.id).single();
      await assertCanAssign(me, target, { role: d.role, allAreas, areas });
      await writeAccess(d.id, { role: d.role, allAreas, areas, full_name: d.full_name, phone: d.phone || null, title: d.title || null });
      let note = "";
      if (target && target.login !== "shared") {
        // someone listed only: their email can be added or fixed here
        if (target.login === "none" && d.email && d.email !== target.email) await changeEmail(d.id, d.email);
        const email = target.login === "none" && d.email ? d.email : target.email;
        const next = d.login ?? target.login;
        if (next !== target.login) {
          if (next === "personal" && isPlaceholderEmail(email)) return fail("Add their email first: they sign in with it.");
          await setLoginKind(d.id, next as LoginKind);
          note = next === "none" ? " They can no longer sign in." : " Send them a sign-in link below so they can get in.";
        }
      }
      revalidatePath("/admin/users");
      return ok(`Saved.${note}`);
    }
    const listed = d.login === "none";
    if (!d.email && !listed) return fail("Enter their email: they sign in with it.");
    await assertCanAssign(me, null, { role: d.role, allAreas, areas });
    if (d.email) {
      const { data: existing } = await admin.from("profiles").select("id").eq("email", d.email).maybeSingle();
      if (existing) return fail("Someone with that email is already in Kinus. Find them in the staff list.");
    }
    const email = d.email || (await placeholderEmail());
    const id = await createAccount(email, d.full_name, d.role, !listed && d.invite === "on" ? "invite" : "none");
    await writeAccess(id, { role: d.role, allAreas, areas, full_name: d.full_name, phone: d.phone || null, title: d.title || null });
    if (listed) await setLoginKind(id, "none");
    revalidatePath("/admin/users");
    if (listed) return ok(`${d.full_name} added. Head staff see them in the phone book; they don't sign in.`, "/admin/users");
    return ok(d.invite === "on" ? `Invitation sent to ${d.email}.` : `${d.full_name} added. Send them a sign-in link when ready.`, "/admin/users");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

async function changeEmail(id: string, email: string) {
  const admin = createAdminClient();
  const { data: taken } = await admin.from("profiles").select("id").eq("email", email).neq("id", id).maybeSingle();
  if (taken) throw new Error("Someone else in Kinus already has that email.");
  const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
  if (error && !/not found/i.test(error.message)) throw error;
  const { error: e } = await admin.from("profiles").update({ email }).eq("id", id);
  if (e) throw e;
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
  const me = await requireStaffManager();
  try {
    const session = await getActiveSession();
    const admin = createAdminClient();
    // names are matched only against the part of camp this person can give (clearer messages)
    const tree = grantableTree(me, await loadAreaTree(admin, session?.id));
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
    // someone over one division (most head counselors) can leave the division column empty
    const rows = planRows(readRows(grid), tree, { role: defaultRole, level: "role", where: tree.divisions.length === 1 ? tree.divisions[0].name : undefined });
    if (!rows.length) return fail("No rows found.");
    const emails = rows.map((r) => r.email).filter(Boolean);
    const [{ data: byEmail }, { data: listedPeople }] = await Promise.all([
      admin.from("profiles").select("id, email, role, full_name").in("email", emails.length ? emails : ["-"]),
      // listed-only people without an email are matched by name (uploading the sheet again updates them)
      admin.from("profiles").select("id, email, role, full_name").eq("login", "none"),
    ]);
    const existing = [...(byEmail ?? []), ...(listedPeople ?? []).filter((p) => !byEmail?.some((x) => x.id === p.id))];
    const lookup = await divisionGroupLookup();
    const removed = await removedRoles();
    // someone already in Kinus may only be changed if they work inside my area (not taken from another division)
    const outside = new Set<string>();
    for (const p of existing ?? []) await assertCanManage(me, [p.id]).catch(() => outside.add(p.id));
    const out = rows.map((r) => {
      const sameName = (p: { full_name: string }) => normalizeName(p.full_name) === normalizeName(r.name);
      const ex = (r.email ? existing.find((p) => p.email.toLowerCase() === r.email) : existing.find((p) => isPlaceholderEmail(p.email) && sameName(p))) ?? null;
      const errors = [...r.errors];
      if (r.role && !canManageRole(me, r.role)) errors.push(`You can't add a ${STAFF_ROLES[r.role].label.toLowerCase()}.`);
      else if (r.role && removed.has(r.role) && r.role !== ex?.role) errors.push(notInUse(r.role));
      if (ex && !canManageRole(me, ex.role)) errors.push(`Already a ${STAFF_ROLES[ex.role].label.toLowerCase()}; you can't change them.`);
      if (ex?.id === me.id) errors.push("That's you.");
      else if (ex && outside.has(ex.id) && canManageRole(me, ex.role)) errors.push("Already works outside your area; ask a director to move them.");
      if (!canGrantAreas(me, r.areas, r.allAreas, lookup)) errors.push("Outside your own area.");
      return { ...r, errors, existingId: ex?.id ?? null, existingRole: ex?.role ?? null };
    });
    return { ok: true, preview: { rows: out } };
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export type BulkResult = { line: number; name: string; email: string; outcome: "invited" | "created" | "listed" | "updated" | "failed"; detail?: string; password?: string };

export async function applyBulkAdd(rowsJson: string, mode: "invite" | "password"): Promise<ActionResult & { results?: BulkResult[] }> {
  const me = await requireStaffManager();
  const rows = JSON.parse(rowsJson) as BulkPreview["rows"];
  const results: BulkResult[] = [];
  for (const r of rows) {
    if (r.errors.length || !r.role) continue;
    const base = { line: r.line, name: r.name, email: r.email };
    try {
      if (r.existingId) {
        await assertCanManage(me, [r.existingId]);
        await assertCanAssign(me, { id: r.existingId, role: r.existingRole ?? undefined }, { role: r.role, allAreas: r.allAreas, areas: r.areas });
        await writeAccess(r.existingId, { role: r.role, allAreas: r.allAreas, areas: r.areas, title: r.title || undefined, phone: r.phone || undefined });
        results.push({ ...base, outcome: "updated" });
        continue;
      }
      await assertCanAssign(me, null, { role: r.role, allAreas: r.allAreas, areas: r.areas });
      if (r.login === "none") {
        const id = await createAccount(r.email || (await placeholderEmail()), r.name, r.role, "none");
        await writeAccess(id, { role: r.role, allAreas: r.allAreas, areas: r.areas, full_name: r.name, title: r.title || null, phone: r.phone || null });
        await setLoginKind(id, "none");
        results.push({ ...base, outcome: "listed" });
        continue;
      }
      const password = mode === "password" ? generatePassword() : undefined;
      const id = await createAccount(r.email, r.name, r.role, password ? { password } : "invite");
      await writeAccess(id, { role: r.role, allAreas: r.allAreas, areas: r.areas, full_name: r.name, title: r.title || null, phone: r.phone || null });
      results.push({ ...base, outcome: password ? "created" : "invited", password });
    } catch (e) {
      results.push({ ...base, outcome: "failed", detail: errorMessage(e) });
    }
  }
  revalidatePath("/admin/users");
  const n = (o: BulkResult["outcome"]) => results.filter((x) => x.outcome === o).length;
  return { ok: true, message: `${n("invited") + n("created")} added, ${n("updated")} updated${n("failed") ? `, ${n("failed")} failed` : ""}.`, results };
}


// ---------------------------------------------------------------------------
// Bulk changes on the staff list
// ---------------------------------------------------------------------------
async function targets(me: CurrentUser, fd: FormData) {
  const ids = fd.getAll("ids").map(String).filter(Boolean);
  if (!ids.length) throw new Error("Select at least one person.");
  if (ids.includes(me.id)) throw new Error("Your own account is selected. Leave yourself out.");
  return assertCanManage(me, ids);
}

export async function bulkSetAccess(fd: FormData): Promise<ActionResult> {
  const me = await requireStaffManager();
  try {
    const people = await targets(me, fd);
    const role = fd.get("role") ? z.enum(ROLES).parse(fd.get("role")) : null;
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
      await writeAccess(p.id, { role: nextRole, allAreas: nextAll, areas: nextAreas });
    }
    revalidatePath("/admin/users");
    return ok(`Updated ${people.length} ${people.length === 1 ? "person" : "people"}.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/**
 * Deletes people completely: their account and sign-in go. What they recorded (check-ins,
 * print requests, imports…) stays, without their name.
 */
export async function deletePeople(fd: FormData): Promise<ActionResult> {
  const me = await requireStaffManager();
  try {
    const people = await targets(me, fd);
    const admin = createAdminClient();
    if (people.some((p) => p.role === "owner")) {
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "owner").eq("is_active", true);
      if ((count ?? 0) - people.filter((p) => p.role === "owner").length < 1) throw new Error("Kinus needs at least one owner. Make someone else an owner first.");
    }
    for (const p of people) {
      const { error } = await admin.auth.admin.deleteUser(p.id);
      // a profile without a sign-in account (rare): remove the profile itself
      if (error && !/not found/i.test(error.message)) throw new Error(`${p.full_name}: ${error.message}`);
      if (error) {
        const del = await admin.from("profiles").delete().eq("id", p.id);
        if (del.error) throw del.error;
      }
    }
    revalidatePath("/admin/users");
    return ok(people.length === 1 ? `${people[0].full_name} was deleted.` : `Deleted ${people.length} people.`, fd.get("back") ? "/admin/users" : undefined);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function bulkSendLinks(fd: FormData): Promise<ActionResult> {
  const me = await requireStaffManager();
  try {
    const all = await targets(me, fd);
    const { data: kinds } = await createAdminClient().from("profiles").select("id, login").in("id", all.map((p) => p.id));
    const people = all.filter((p) => kinds?.find((k) => k.id === p.id)?.login === "personal");
    if (!people.length) return fail("None of them sign in with their own email (listed-only staff and check-in logins don't get links).");
    const failed: string[] = [];
    for (const p of people) {
      const r = await sendLink(p.email);
      if (r.error) failed.push(`${p.full_name}: ${r.error}`);
    }
    return failed.length ? fail(`Sent ${people.length - failed.length}. Not sent: ${failed.join("; ")}`) : ok(`Sign-in links emailed to ${people.length} ${people.length === 1 ? "person" : "people"}.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function bulkSetActive(fd: FormData): Promise<ActionResult> {
  const me = await requireStaffManager();
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
/** A sign-in link, or the invitation again for someone who never accepted it. */
async function sendLink(email: string): Promise<{ sent: "invite" | "link"; error: string | null }> {
  const r = await emailWayIn(email, await signInRedirect());
  return { ...r, error: r.error && /rate limit|security purposes|too many/i.test(r.error) ? "Too many emails just now. Wait a minute and try again." : r.error };
}

export async function sendSignInLink(fd: FormData): Promise<ActionResult> {
  const me = await requireStaffManager();
  const email = String(fd.get("email"));
  const { data: target } = await createAdminClient().from("profiles").select("id, login").eq("email", email).maybeSingle();
  if (!target) return fail("No staff account with that email.");
  if (target.login !== "personal") return fail(target.login === "none" ? "They're listed only and don't sign in. Change that on their page first." : "Check-in logins use a password: set a new one under Check-in logins.");
  try {
    await assertCanManage(me, [target.id]);
  } catch (e) {
    return fail(errorMessage(e));
  }
  const r = await sendLink(email);
  if (r.error) return fail(r.error);
  return ok(r.sent === "invite" ? `They hadn't accepted their invitation yet, so it was sent again to ${email} with a new link.` : `Sign-in link emailed to ${email}. It also lets them choose a new password.`);
}

export async function setUserPassword(fd: FormData): Promise<ActionResult> {
  const me = await requireStaffManager();
  const id = String(fd.get("id"));
  const pw = String(fd.get("password") ?? "");
  if (pw.length < 8) return fail("Use at least 8 characters.");
  const admin = createAdminClient();
  try {
    if (!(await assertCanManage(me, [id])).length) return fail("You can't set this person's password.");
  } catch (e) {
    return fail(errorMessage(e));
  }
  const { error } = await admin.auth.admin.updateUserById(id, { password: pw, email_confirm: true });
  if (error) return fail(error.message);
  return ok("Password set. Share it with them privately; they can change it under Your account.");
}

export async function setActive(fd: FormData): Promise<ActionResult> {
  const me = await requireStaffManager();
  const id = String(fd.get("id"));
  const active = fd.get("active") === "true";
  if (id === me.id) return fail("You can't deactivate yourself.");
  const admin = createAdminClient();
  try {
    if (!(await assertCanManage(me, [id])).length) return fail("You can't change this person.");
  } catch (e) {
    return fail(errorMessage(e));
  }
  const { error } = await admin.from("profiles").update({ is_active: active }).eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/admin/users");
  return ok(active ? "Account reactivated." : "Account deactivated. They can no longer see anything.");
}

/** A lost or handed-on phone: remove every Face ID / fingerprint sign-in this person set up. */
export async function removePasskeys(fd: FormData): Promise<ActionResult> {
  const me = await requireStaffManager();
  const id = String(fd.get("id"));
  try {
    if (!(await assertCanManage(me, [id])).length) return fail("You can't change this person.");
    const admin = createAdminClient();
    const { data: keys, error } = await admin.auth.admin.passkey.listPasskeys({ userId: id });
    if (error) throw error;
    for (const k of keys ?? []) {
      const { error: e } = await admin.auth.admin.passkey.deletePasskey({ userId: id, passkeyId: k.id });
      if (e) throw e;
    }
    revalidatePath(`/admin/users/${id}`);
    const n = keys?.length ?? 0;
    return ok(n ? `Removed ${n === 1 ? "1 Face ID sign-in" : `${n} Face ID sign-ins`}. They sign in with their password or an emailed link.` : "They had no Face ID sign-ins.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

// ---------------------------------------------------------------------------
// Check-in logins: as many per division as it needs, each shared by some of its check-in phones
// ---------------------------------------------------------------------------
export type CheckinResult = ActionResult & { username?: string; password?: string };

async function assertCheckinDivision(me: CurrentUser, divisionId: string) {
  if (!canManageRole(me, "scanner")) throw new Error("You can't set up check-in logins.");
  if (!canGrantAreas(me, [{ group_id: null, division_id: divisionId, bunk_id: null }], false, await divisionGroupLookup())) throw new Error("That division isn't yours.");
}

/**
 * Adds a check-in login to a division, with the name and password the person creating it
 * chose (or, left empty, "division-1", "division-1-2"… and a generated password).
 */
export async function createCheckinLogin(divisionId: string, chosen?: { name?: string; password?: string }): Promise<CheckinResult> {
  const me = await requireStaffManager();
  try {
    await assertCheckinDivision(me, divisionId);
    if ((await removedRoles()).has("scanner")) return fail(notInUse("scanner"));
    const admin = createAdminClient();
    const { data: division } = await admin.from("divisions").select("id, name").eq("id", divisionId).single();
    if (!division) return fail("Division not found.");
    const taken = async (n: string) => Boolean((await admin.from("profiles").select("id").ilike("email", `checkin.${n}@%`).maybeSingle()).data);
    const password = chosen?.password?.trim() || generatePassword();
    let name: string;
    if (chosen?.name?.trim()) {
      const problem = checkinLoginProblem(chosen.name, password);
      if (problem) return fail(problem);
      name = checkinName(chosen.name);
      if (await taken(name)) return fail(`There's already a check-in login called ${name}. Choose another name.`);
    } else {
      if (password.length < 8) return fail("Use a password of at least 8 characters.");
      // a short, unique name to type on the phone
      name = checkinName(division.name);
      for (let n = 2; await taken(name); n++) name = `${checkinName(division.name)}-${n}`;
    }
    const fullName = `${division.name} check-in (${name})`;
    const id = await createAccount(await checkinEmail(name), fullName, "scanner", { password });
    await writeAccess(id, { role: "scanner", allAreas: false, areas: [{ group_id: null, division_id: divisionId, bunk_id: null }], full_name: fullName, title: "Check-in phones" });
    await setLoginKind(id, "shared");
    revalidatePath("/admin/users");
    return { ok: true, message: "Check-in login created.", username: name, password };
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** A new password for a check-in login (the old one stops working). */
export async function resetCheckinPassword(id: string, chosen?: string): Promise<CheckinResult> {
  const me = await requireStaffManager();
  try {
    const admin = createAdminClient();
    const { data: p } = await admin.from("profiles").select("id, email, login").eq("id", id).single();
    if (!p || p.login !== "shared") return fail("That isn't a check-in login.");
    await assertCanManage(me, [id]);
    const password = chosen?.trim() || generatePassword();
    if (password.length < 8) return fail("Use a password of at least 8 characters.");
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) throw error;
    return { ok: true, message: "New password set. Phones signed in with the old one stay signed in until they sign out.", username: p.email.slice("checkin.".length, p.email.indexOf("@")), password };
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/**
 * Final check-out for a check-in login: "gone home" for every division of its camp, on the
 * Final check-out page. It reaches the whole camp, so only someone over all of that camp may
 * turn it on or off.
 */
export async function setFinalCheckout(id: string, on: boolean): Promise<ActionResult> {
  const me = await requireStaffManager();
  try {
    const admin = createAdminClient();
    const [{ data: p }, { data: scopes }] = await Promise.all([
      admin.from("profiles").select("id, login, full_name").eq("id", id).single(),
      admin.from("staff_scopes").select("division_id").eq("user_id", id),
    ]);
    if (!p || p.login !== "shared") return fail("Final check-out is for check-in logins.");
    await assertCanManage(me, [id]);
    const groupOf = await divisionGroupLookup();
    const camps = [...new Set((scopes ?? []).map((s) => (s.division_id ? groupOf(s.division_id) : null)).filter((g): g is string => Boolean(g)))];
    if (!camps.length) return fail("This login isn't in a division.");
    if (!canGrantAreas(me, camps.map((g) => ({ group_id: g, division_id: null, bunk_id: null })), false, groupOf))
      return fail("Final check-out reaches every division of the camp: a director over the whole camp turns it on.");
    const { error } = await admin.from("profiles").update({ final_checkout: on }).eq("id", id);
    if (error) return fail(/final_checkout/.test(error.message) ? "The database needs updating first (migration 0029)." : error.message);
    revalidatePath("/admin/users");
    return ok(on ? "Final check-out is on for this login: it now has a Final check-out page for the whole camp." : "Final check-out is off for this login.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}
