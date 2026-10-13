import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { seesAllCamp } from "@/lib/auth/permissions";
import { canPrintFor } from "./jobs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether this person may open (print, mark, resend) all of these requests: the database
 * lets them see each one, and each camper on it is in their part of camp (someone over part
 * of camp doesn't print other divisions' tags). Whoever asked for a request may always open it.
 * One query each, however many requests.
 */
export async function visibleJobs(ids: string[]): Promise<boolean> {
  const user = await getCurrentUser();
  const unique = [...new Set(ids)];
  if (!user || !unique.length || unique.some((id) => !UUID.test(id))) return false;
  const supabase = await createClient();
  const { data: jobs } = await supabase.from("print_jobs").select("id, requested_by").in("id", unique);
  if (!jobs || jobs.length !== unique.length) return false;
  if (seesAllCamp(user)) return true;
  const others = jobs.filter((j) => j.requested_by !== user.id).map((j) => j.id);
  if (!others.length) return true;
  const { fetchAll } = await import("@/lib/supabase/fetch-all");
  const admin = createAdminClient();
  const items = await fetchAll((from, to) => admin.from("print_job_items").select("job_id, camper_id, campers(division_id, bunk_id)").in("job_id", others).order("job_id").order("camper_id").range(from, to));
  return items.every((i) => {
    const c = i.campers as { division_id: string | null; bunk_id: string | null } | null;
    return c ? canPrintFor(user, c) : true;
  });
}

/** The job if this person may open it (see visibleJobs). */
export async function visibleJob(id: string) {
  if (!(await visibleJobs([id]))) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("print_jobs").select("id, pdf_path, template_id, item_count").eq("id", id).maybeSingle();
  return data;
}
