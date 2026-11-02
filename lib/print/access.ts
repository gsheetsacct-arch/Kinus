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
  // division heads open their divisions' requests (their check-in's labels, whoever scanned):
  // read with the server's key, then checked camper by camper below
  const supabase = scopedQueue(user) ? createAdminClient() : await createClient();
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

/**
 * The same check for someone known (the design connector, which has no sign-in cookie): the
 * print area, or their own requests; and every camper on others' requests in their part of camp.
 */
export async function jobsVisibleTo(user: import("@/lib/auth/permissions").CurrentUser, ids: string[]): Promise<boolean> {
  const unique = [...new Set(ids)];
  if (!unique.length || unique.some((id) => !UUID.test(id))) return false;
  const admin = createAdminClient();
  const { data: jobs } = await admin.from("print_jobs").select("id, requested_by").in("id", unique);
  if (!jobs || jobs.length !== unique.length) return false;
  const others = jobs.filter((j) => j.requested_by !== user.id).map((j) => j.id);
  if (!others.length) return true;
  const { canUsePrintArea } = await import("@/lib/auth/permissions");
  if (!canUsePrintArea(user)) return false;
  if (seesAllCamp(user)) return true;
  const { fetchAll } = await import("@/lib/supabase/fetch-all");
  const items = await fetchAll((from, to) => admin.from("print_job_items").select("job_id, camper_id, campers(division_id, bunk_id)").in("job_id", others).order("job_id").order("camper_id").range(from, to));
  return items.every((i) => {
    const c = i.campers as { division_id: string | null; bunk_id: string | null } | null;
    return c ? canPrintFor(user, c) : true;
  });
}

/** Division heads: the print queue is their divisions' requests, and their own; no one else's. */
export const scopedQueue = (user: import("@/lib/auth/permissions").CurrentUser) => user.role === "division_head";

/**
 * The requests of this session a division head sees: their own, and those whose campers are
 * all in their divisions (the labels from their division's check-in, whoever scanned them).
 */
export async function myAreaJobIds(user: import("@/lib/auth/permissions").CurrentUser, sessionId: string): Promise<Set<string>> {
  const { fetchAll } = await import("@/lib/supabase/fetch-all");
  const admin = createAdminClient();
  const items = await fetchAll((from, to) =>
    admin
      .from("print_job_items")
      .select("job_id, camper_id, campers(division_id, bunk_id), print_jobs!inner(session_id, requested_by)")
      .eq("print_jobs.session_id", sessionId)
      .order("job_id")
      .order("camper_id")
      .range(from, to),
  );
  const mine = new Set<string>();
  const outside = new Set<string>();
  for (const i of items) {
    const j = i.print_jobs as unknown as { requested_by: string | null };
    if (j?.requested_by === user.id) {
      mine.add(i.job_id);
      continue;
    }
    const c = i.campers as { division_id: string | null; bunk_id: string | null } | null;
    if (c && canPrintFor(user, c)) mine.add(i.job_id);
    else outside.add(i.job_id);
  }
  // a request with any camper outside their divisions isn't theirs (unless they asked for it)
  for (const i of items) if (outside.has(i.job_id) && (i.print_jobs as unknown as { requested_by: string | null })?.requested_by !== user.id) mine.delete(i.job_id);
  return mine;
}

/** The requests of this session whose campers are all in these divisions (a check-in location, or a camp). */
export async function jobIdsInDivisions(sessionId: string, divisionIds: string[]): Promise<Set<string>> {
  const { fetchAll } = await import("@/lib/supabase/fetch-all");
  const wanted = new Set(divisionIds);
  const items = await fetchAll((from, to) =>
    createAdminClient()
      .from("print_job_items")
      .select("job_id, camper_id, campers(division_id), print_jobs!inner(session_id)")
      .eq("print_jobs.session_id", sessionId)
      .order("job_id")
      .order("camper_id")
      .range(from, to),
  );
  const inside = new Set<string>();
  const outside = new Set<string>();
  for (const i of items) (wanted.has((i.campers as { division_id: string | null } | null)?.division_id ?? "") ? inside : outside).add(i.job_id);
  for (const id of outside) inside.delete(id);
  return inside;
}
