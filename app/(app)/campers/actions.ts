"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireAdmin, requireUser } from "@/lib/auth/current-user";
import { canAccessBunk, canAddWalkIn, visibleFieldGroups } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { parsePhone } from "@/lib/import/mapping";
import type { Database } from "@/lib/supabase/database.types";

type CamperUpdate = Database["public"]["Tables"]["campers"]["Update"];

const opt = z.string().trim().optional().transform((v) => (v ? v : null));
const tri = z.enum(["", "true", "false"]).optional().transform((v) => (v === "true" ? true : v === "false" ? false : null));

const edit = z.object({
  id: z.guid(),
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  placement: z.string().optional(),
  grade: opt,
  tshirt_size: opt,
  local_address: opt,
  local_address_cross_streets: opt,
  medical_notes: opt,
  allergies: opt,
  has_allergies: tri,
  has_epipen: tri,
  has_medications: tri,
  notes_from_parents: opt,
  staff_notes: opt,
});

export async function updateCamper(fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const d = edit.parse(Object.fromEntries(fd));
    const supabase = await createClient();
    const [{ data: current }, { data: fv }] = await Promise.all([
      supabase.from("campers").select("bunk_id, division_id").eq("id", d.id).maybeSingle(),
      supabase.from("field_visibility").select("field_group, roles"),
    ]);
    if (!current) return fail("You cannot edit this camper.");
    // only details this person can see are written: the form leaves the rest empty, and
    // saving those would wipe them
    const groups = visibleFieldGroups(user, fv ?? []);
    const patch: CamperUpdate = {
      first_name: d.first_name,
      last_name: d.last_name,
      grade: d.grade,
      tshirt_size: d.tshirt_size,
    };
    if (groups.has("staff_notes")) patch.staff_notes = d.staff_notes;
    if (groups.has("address")) Object.assign(patch, { local_address: d.local_address, local_address_cross_streets: d.local_address_cross_streets });
    if (groups.has("medical"))
      Object.assign(patch, { medical_notes: d.medical_notes, allergies: d.allergies, has_allergies: d.has_allergies, has_epipen: d.has_epipen, has_medications: d.has_medications });
    if (groups.has("parent_notes")) patch.notes_from_parents = d.notes_from_parents;
    // placement: "b:<bunk id>" or "d:<division id>" (in the division, no bunk)
    if (d.placement) {
      const [kind, pid] = d.placement.split(":");
      let division_id = current.division_id;
      let bunk_id: string | null = null;
      if (kind === "b") {
        const { data: b } = await supabase.from("bunks").select("division_id").eq("id", pid).maybeSingle();
        if (!b) return fail("That bunk no longer exists.");
        division_id = b.division_id;
        bunk_id = pid;
      } else if (kind === "d") {
        division_id = pid;
      }
      if (division_id !== current.division_id || bunk_id !== current.bunk_id) {
        Object.assign(patch, { division_id, bunk_id, bunk_locked_by_staff: true });
      }
    }
    const { data: saved, error } = await supabase.from("campers").update(patch).eq("id", d.id).select("id");
    if (error) throw error;
    if (!saved?.length) return fail("You can't edit this camper.");
    revalidatePath(`/campers/${d.id}`);
    return ok("Saved.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

const contact = z.object({
  camper_id: z.guid(),
  role: z.enum(["mother", "father", "guardian", "emergency", "host", "authorized_pickup"]),
  name: opt,
  phone: opt,
  email: opt,
});

export async function addContact(fd: FormData): Promise<ActionResult> {
  await requireUser();
  try {
    const d = contact.parse(Object.fromEntries(fd));
    if (!d.name && !d.phone) return fail("Give a name or a phone number.");
    const supabase = await createClient();
    const { data: existing } = await supabase.from("camper_contacts").select("slot").eq("camper_id", d.camper_id).eq("role", d.role);
    const slot = Math.max(0, ...(existing ?? []).map((e) => e.slot)) + 1;
    const { error } = await supabase.from("camper_contacts").insert({
      camper_id: d.camper_id,
      role: d.role,
      slot,
      name: d.name,
      phone: d.phone,
      phone_e164: parsePhone(d.phone, "US"),
      email: d.email?.toLowerCase() ?? null,
      source: "manual",
    });
    if (error) throw error;
    revalidatePath(`/campers/${d.camper_id}`);
    return ok("Contact added.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function removeContact(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const id = String(fd.get("id"));
  const camperId = String(fd.get("camper_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("camper_contacts").delete().eq("id", id).eq("source", "manual");
  if (error) return fail(error.message);
  revalidatePath(`/campers/${camperId}`);
  return ok("Contact removed.");
}

export async function archiveCamper(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(fd.get("id"));
  const restore = fd.get("restore") === "1";
  const supabase = await createClient();
  const { error } = await supabase.from("campers").update({ archived_at: restore ? null : new Date().toISOString() }).eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return ok(restore ? "Camper restored." : "Camper archived.");
}

const walkIn = z.object({ first_name: z.string().trim().min(1), last_name: z.string().trim().min(1), division_id: z.guid(), bunk_id: z.string().optional(), add_anyway: z.string().optional() });

export async function createWalkIn(fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const session = await getActiveSession();
  if (!session) return fail("No active session.");
  try {
    const d = walkIn.parse(Object.fromEntries(fd));
    if (!canAddWalkIn(user) || !canAccessBunk(user, d.division_id, d.bunk_id || null, "edit")) return fail("You can only add walk-ins to a division you can edit.");
    // the registration desk often types a name that's already there (a sibling, or registered after all)
    if (!d.add_anyway) {
      const { data: same } = await createAdminClient()
        .from("campers")
        .select("id, divisions(name), bunks(name)")
        .eq("session_id", session.id)
        .is("archived_at", null)
        .ilike("first_name", d.first_name.replace(/[%_]/g, ""))
        .ilike("last_name", d.last_name.replace(/[%_]/g, ""))
        .limit(3);
      if (same?.length) {
        const where = same.map((s) => [(s.divisions as { name: string } | null)?.name, (s.bunks as { name: string } | null)?.name].filter(Boolean).join(" · ")).join("; ");
        return fail(`${d.first_name} ${d.last_name} is already registered (${where}). Check it isn't the same child, then tick “Add anyway”.`);
      }
    }
    // inserting campers is an admin right in the database; the check above is the desk's
    const { data, error } = await createAdminClient()
      .from("campers")
      .insert({ session_id: session.id, first_name: d.first_name, last_name: d.last_name, division_id: d.division_id, bunk_id: d.bunk_id || null, bunk_locked_by_staff: Boolean(d.bunk_id), in_latest_import: false })
      .select("id")
      .single();
    if (error) throw error;
    revalidatePath("/campers");
    return ok("Camper added (not from an import).", `/campers/${data.id}`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}
