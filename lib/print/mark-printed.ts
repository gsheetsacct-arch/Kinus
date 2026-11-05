import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { inChunks } from "@/lib/supabase/in-chunks";
import { canPrintCheckin, canUsePrintArea, type CurrentUser } from "@/lib/auth/permissions";

/**
 * Marks requests printed by this person, as the PDF with them is sent (a PDF button's "and mark
 * printed": done by the server, so it happens even when the page never hears the download
 * started, e.g. a phone that downloads in a separate view). The caller has checked the person
 * may open the requests (visibleJobs). Already printed or cancelled ones stay as they are.
 */
export async function markSentPrinted(user: CurrentUser, ids: string[]): Promise<void> {
  if (!ids.length || !(canUsePrintArea(user) || canPrintCheckin(user))) return;
  const done = await inChunks(ids, (c) =>
    createAdminClient()
      .from("print_jobs")
      .update({ status: "printed", printed_at: new Date().toISOString(), printed_by: user.id })
      .in("id", c)
      .not("status", "in", "(printed,cancelled)")
      .select("id"),
  );
  // printed from Kinus just now: "changed since printed" starts from these labels
  if (done.length) {
    const { refreshPrintedHashes } = await import("./updates");
    await refreshPrintedHashes(done.map((d) => d.id)).catch((e) => console.error("Updating label fingerprints failed", e));
  }
}
