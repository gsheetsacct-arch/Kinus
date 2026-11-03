"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { FIELD_GROUPS, STAFF_ROLES } from "@/lib/labels";
import { KEPT_ROLES, loadRoles } from "@/lib/data/roles";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

const ROLES = ["director", "division_head", "kloli", "head_counselor", "counselor", "scanner", "office", "logistics", "staff"] as const;
const level = z.enum(["view", "scan", "edit"]);

/** Saves what each role can do and see. Everyone with that role gets it at once. */
export async function saveRoles(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const supabase = await createClient();
    // removed roles aren't on the form: they keep what they had
    const shown = ROLES.filter((r) => fd.get(`level:${r}`) !== null);
    const { error } = await supabase.from("role_access").upsert(shown.map((role) => ({ role, access_level: level.parse(fd.get(`level:${role}`)) })));
    if (error) throw error;
    const setup = await loadRoles(supabase);
    for (const g of Object.keys(FIELD_GROUPS)) {
      const roles = ["owner" as const, ...ROLES.filter((r) => (shown.includes(r) ? fd.get(`see:${g}:${r}`) === "on" : setup.sees[r].includes(g)))];
      const { error: e } = await supabase.from("field_visibility").update({ roles }).eq("field_group", g);
      if (e) throw e;
    }
    revalidatePath("/", "layout");
    return ok("Saved. Everyone in each role has these permissions now.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** Removes a role the camp doesn't use (it stops being offered anywhere), or brings it back. */
export async function setRoleInUse(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    const role = z.enum(ROLES).parse(fd.get("role"));
    const inUse = fd.get("in_use") === "on";
    const name = STAFF_ROLES[role].label;
    if (!inUse && KEPT_ROLES.includes(role)) return fail(`${name} can't be removed.`);
    if (!inUse) {
      const { count, error } = await createAdminClient().from("profiles").select("id", { count: "exact", head: true }).eq("role", role).eq("is_active", true);
      if (error) throw error;
      if (count) return fail(`${count === 1 ? "1 person has" : `${count} people have`} this role. Give them another role first.`);
    }
    const supabase = await createClient();
    const setup = await loadRoles(supabase);
    const { error } = await supabase.from("role_access").upsert({ role, access_level: setup.levels[role], enabled: inUse });
    if (error) throw error;
    revalidatePath("/", "layout");
    return ok(inUse ? `${name} is back.` : `${name} removed. Bring it back any time at the bottom of this page.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** Who sees each added column (Roles → "What each kind of detail covers"): its detail group, or everyone. */
export async function saveColumnGroups(fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  try {
    const { EXTRA_GROUPS, parseExtraFields } = await import("@/lib/import/extra-fields");
    const supabase = await createClient();
    const { data: current } = await supabase.from("settings").select("value").eq("key", "extra_fields").maybeSingle();
    const fields = parseExtraFields(current?.value).map((f) => {
      if (!fd.has(`group:${f.column}`)) return f;
      const g = String(fd.get(`group:${f.column}`) ?? "");
      const { group: _old, ...rest } = f;
      void _old;
      return (EXTRA_GROUPS as readonly string[]).includes(g) ? { ...rest, group: g as (typeof EXTRA_GROUPS)[number] } : rest;
    });
    const { error } = await supabase.from("settings").upsert({ key: "extra_fields", value: fields, updated_by: me.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    revalidatePath("/", "layout");
    return ok("Saved. Each added column shows only to the roles that see its kind of detail.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}
