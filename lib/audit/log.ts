import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentActor } from "./actor";

/** Things done on the site that aren't a change of data: downloads, sign-ins… */
export type ActivityKind = "download" | "sign_in" | "print" | "send";

/**
 * Notes something done on the site in the activity log (Admin → Activity), as whoever is
 * signed in (or `who`). Never fails what it's noting: a log that can't be written is only
 * reported in the server's log.
 */
export async function logActivity(kind: ActivityKind, detail: { what: string } & Record<string, unknown>, who?: string | null): Promise<void> {
  try {
    const actor = await currentActor();
    const { error } = await createAdminClient()
      .from("audit_log")
      .insert({ actor_id: who ?? actor?.id ?? null, source: "ui", table_name: "app", action: kind, after: detail as never, via: actor?.via ?? null });
    if (error) throw error;
  } catch (e) {
    console.error("Writing the activity log failed", e);
  }
}
