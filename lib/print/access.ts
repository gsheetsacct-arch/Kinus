import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";

/** The job if this person may see it (print area roles, or whoever asked for it). RLS decides. */
export async function visibleJob(id: string) {
  const user = await getCurrentUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("print_jobs").select("id, pdf_path, template_id, item_count").eq("id", id).maybeSingle();
  return data;
}
