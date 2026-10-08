import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { serverEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS. Server only, and only for the operations the
 * architecture reserves for it (imports, invites, email, undo window).
 */
export function createAdminClient() {
  const env = serverEnv();
  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
