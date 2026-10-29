import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export { ORGANIZATION, PROGRAM } from "@/lib/update-signups";
export const UPDATED = "October 29, 2026";

/** Where people write with questions: the office email (Admin → Settings), if set. */
export async function contactEmail(): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from("settings").select("value").eq("key", "office_email").maybeSingle();
    const to = (data?.value as { to?: string } | null)?.to?.trim();
    return to || null;
  } catch {
    return null;
  }
}
