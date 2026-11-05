"use server";
import { revalidatePath } from "next/cache";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { canUsePrintArea } from "@/lib/auth/permissions";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";
import { parseOrder } from "@/lib/print/order";

/** Staff tags into the print queue (Print → Queue), to print with the rest: these people, or blank badges. */
export async function queueStaffTags(input: { templateId: string; ids?: string[]; copies?: number; order?: string; blank?: { count: number; division: string } | null }): Promise<ActionResult> {
  const me = await requireUser();
  if (!canUsePrintArea(me)) return fail("Printing is for the office and directors.");
  try {
    const session = await getActiveSession();
    if (!session) return fail("No active session.");
    const { staffQueueItems } = await import("@/lib/print/staff");
    const items = await staffQueueItems(me, { ids: input.ids, copies: input.copies, blank: input.blank });
    if (!items.length) return fail(input.blank ? "Pick a division and how many." : "Tick who to print for.");
    const { createStaffPrintJob } = await import("@/lib/print/jobs");
    const blank = input.blank && !input.ids?.length;
    // who's new (a first badge) and whose tag changed since printed, for the job's note
    const { staffTagKinds } = await import("@/lib/print/staff");
    const { changeNote } = await import("@/lib/print/change-note");
    const people = items.filter((i): i is typeof i & { id: string } => Boolean(i.id && i.name)).map((i) => ({ id: i.id, name: i.name, values: i.values }));
    const kinds = people.length ? await staffTagKinds(input.templateId, people) : new Map<string, "new" | "updated">();
    const kindNote = changeNote(people.filter((p) => kinds.has(p.id)).map((p) => ({ name: p.name, kind: kinds.get(p.id)! })));
    const job = await createStaffPrintJob(me, {
      sessionId: session.id,
      templateId: input.templateId,
      items,
      order: parseOrder(input.order),
      note: (blank ? `Blank badges · ${input.blank!.division}` : `Staff · ${[...new Set(items.map((i) => i.division).filter(Boolean))].slice(0, 4).join(", ") || "no division"}`) + kindNote,
    });
    revalidatePath("/print");
    return ok(`${job.tags} ${job.tags === 1 ? "tag" : "tags"} added to the print queue.`, `/print/jobs/${job.id}`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}
