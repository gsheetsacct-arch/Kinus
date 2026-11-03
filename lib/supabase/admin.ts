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
    global: { fetch: auditedFetch },
  });
}

/**
 * Changes (anything but a read) say whom they're made for and from which page, so the
 * activity log names the person, not "Kinus" (the database trusts this only from this key).
 */
const auditedFetch: typeof fetch = async (input, init) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method === "GET" || method === "HEAD") return fetch(input, init);
  const actor = await import("@/lib/audit/actor").then((m) => m.currentActor()).catch(() => null);
  if (!actor) return fetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set("x-kinus-actor", actor.id);
  // header values are ASCII: a page address with Hebrew in it is sent percent-encoded
  if (actor.via) headers.set("x-kinus-via", actor.via.replace(/[^\x20-\x7e]/g, (c) => encodeURIComponent(c)).slice(0, 200));
  return fetch(input, { ...init, headers });
};
