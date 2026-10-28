import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AreaTree } from "@/lib/data/areas";
import { parsePhone } from "@/lib/import/mapping";
import type { TextRecipient } from "@/lib/sms";

/**
 * Everyone a staff text could go to: active staff (not check-in logins) with the divisions they
 * work in, and the people who signed up on /updates without being on the staff list. Read with the
 * admin client (phones aren't readable to staff); pickRecipients chooses from it.
 */
export async function loadTextRecipients(admin: SupabaseClient<Database>, tree: AreaTree): Promise<TextRecipient[]> {
  const [{ data: people }, { data: scopes }, signups, optOuts] = await Promise.all([
    admin.from("profiles").select("id, full_name, phone, role, all_areas").eq("is_active", true).neq("login", "shared"),
    admin.from("staff_scopes").select("user_id, group_id, division_id"),
    // read on their own: a database without migration 0038/0039 yet still lists the staff
    admin.from("update_signups").select("id, full_name, phone_e164").then((r) => r.data ?? [], () => []),
    admin.from("text_opt_outs").select("phone_e164").then((r) => r.data ?? [], () => []),
  ]);
  const stopped = new Set(optOuts.map((o) => o.phone_e164));
  const inSession = new Set(tree.divisions.map((d) => d.id));
  const byGroup = new Map<string, string[]>();
  for (const d of tree.divisions) if (d.group_id) byGroup.set(d.group_id, [...(byGroup.get(d.group_id) ?? []), d.id]);
  const divisionsOf = new Map<string, Set<string>>();
  for (const s of scopes ?? []) {
    const set = divisionsOf.get(s.user_id) ?? new Set<string>();
    if (s.division_id && inSession.has(s.division_id)) set.add(s.division_id);
    if (s.group_id) for (const d of byGroup.get(s.group_id) ?? []) set.add(d);
    divisionsOf.set(s.user_id, set);
  }
  const staff: TextRecipient[] = (people ?? []).map((p) => {
    const phone = parsePhone(p.phone, "US");
    return {
      key: p.id,
      profileId: p.id,
      name: p.full_name,
      phone,
      // directors and office over all of camp aren't the staff of any one division
      divisionIds: p.role === "owner" || p.all_areas ? [] : [...(divisionsOf.get(p.id) ?? [])],
      optedOut: Boolean(phone && stopped.has(phone)),
      signup: false,
    };
  });
  const staffPhones = new Set(staff.map((s) => s.phone).filter(Boolean));
  const fromSignups: TextRecipient[] = signups
    .filter((s) => !staffPhones.has(s.phone_e164))
    .map((s) => ({ key: `signup:${s.id}`, profileId: null, name: s.full_name, phone: s.phone_e164, divisionIds: [], optedOut: stopped.has(s.phone_e164), signup: true }));
  return [...staff, ...fromSignups];
}
