import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { regularCampOf, thursdayCamp } from "./thursday";

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * Before an import with Thursday Program campers is applied: each Thursday division
 * ("Thursday Program - English") exists, in its Thursday camp ("Thursday American", made if
 * need be, after the other camps), in the regular camp's language (Hebrew names for Thursday
 * Hebrew). A division someone already put somewhere else stays where they put it.
 */
export async function ensureThursdayCamps(sessionId: string, divisions: string[]) {
  const admin = createAdminClient();
  const [{ data: groups, error: ge }, { data: divs, error: de }] = await Promise.all([
    admin.from("division_groups").select("id, name, sort_order").eq("session_id", sessionId),
    admin.from("divisions").select("id, name, group_id, language, sort_order").eq("session_id", sessionId),
  ]);
  if (ge) throw ge;
  if (de) throw de;
  const camps = [...(groups ?? [])];
  const all = [...(divs ?? [])];
  for (const name of divisions) {
    const campName = thursdayCamp(name);
    if (!campName) continue;
    let camp = camps.find((g) => same(g.name, campName));
    if (!camp) {
      const sort = Math.max(0, ...camps.map((g) => g.sort_order ?? 0)) + 1;
      const { data, error } = await admin.from("division_groups").insert({ session_id: sessionId, name: campName, sort_order: sort }).select("id, name, sort_order").single();
      if (error) throw error;
      camp = data;
      camps.push(data);
    }
    // the regular camp's language: Thursday Hebrew shows Hebrew names, as Hebrew does
    const regular = camps.find((g) => same(g.name, regularCampOf(campName)));
    const language = (regular && all.find((d) => d.group_id === regular.id)?.language) || (/hebrew/i.test(campName) ? "he" : /french/i.test(campName) ? "fr" : "en");
    const had = all.find((d) => same(d.name, name));
    if (had) {
      if (!had.group_id) {
        const { error } = await admin.from("divisions").update({ group_id: camp.id }).eq("id", had.id);
        if (error) throw error;
      }
      continue;
    }
    const sort = Math.max(0, ...all.map((d) => d.sort_order ?? 0)) + 1;
    const { data, error } = await admin.from("divisions").insert({ session_id: sessionId, name, group_id: camp.id, language, sort_order: sort }).select("id, name, group_id, language, sort_order").single();
    if (error) throw error;
    all.push(data);
  }
}
