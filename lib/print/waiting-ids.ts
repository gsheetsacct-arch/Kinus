import "server-only";
import { getActiveSession, getCurrentUser } from "@/lib/auth/current-user";
import { canUsePrintArea } from "@/lib/auth/permissions";
import { checkinJobIds, checkinOnly } from "./access";
import { queueScope, waitingSets } from "./queue";

/**
 * ?waiting=<label size>[&camp=…][&division=…]: every label-printer label of that size still to
 * print in that part of the queue (worked out here, so the address stays short however many
 * there are). Null when this person can't use the print queue.
 */
export async function waitingIds(sp: URLSearchParams): Promise<string[] | null> {
  const [user, session] = await Promise.all([getCurrentUser(), getActiveSession()]);
  if (!user || !session || !(canUsePrintArea(user) || checkinOnly(user))) return null;
  const { shows } = await queueScope(user, session.id, { camp: sp.get("camp"), division: sp.get("division") });
  const sets = checkinOnly(user) ? await checkinWaitingSets(session.id, shows) : await waitingSets(session.id, shows);
  return sets.find((s) => s.key === sp.get("waiting"))?.ids ?? [];
}

/** A check-in login's labels to print: the label-printer ones made at check-in, in its divisions. */
export async function checkinWaitingSets(sessionId: string, shows: (jobId: string) => boolean) {
  const candidates = (await waitingSets(sessionId, shows)).filter((s) => s.key.endsWith("t")).flatMap((s) => s.ids);
  const made = await checkinJobIds(candidates);
  // the sets again, of those only (their counts and tags)
  return (await waitingSets(sessionId, (id) => made.has(id) && shows(id))).filter((s) => s.key.endsWith("t"));
}
